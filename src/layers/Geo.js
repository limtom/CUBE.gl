/**
 * CUBE.GL
 * Layer: Geographical layer like buildings, roads
 * Jeff Wu
 * https://cubegl.org/
 * https://github.com/isjeffcom/CUBE.gl
 * 2020.10.07
*/

import * as THREE from 'three'
import { Coordinate } from '../coordinate/Coordinate'
import { GenShape, GenGeometry, GenHelper, MergeGeometry, GenWaterGeometry } from '../utils/ModelBuilder'
import { Water } from 'three/examples/jsm/objects/Water'
import { Line2 } from 'three/examples/jsm/lines/Line2'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { GeometryUtils } from 'three/examples/jsm/utils/GeometryUtils.js';

// import { Line2 } from 'three/examples/jsm/lines/Line2.js'
// import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
// import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'

import CUBE_Material from '../materials/CUBE_Material'
import { Animation } from '../animation/Animation'
import { Layer } from './Layer'
import { CurvePath, LineCurve } from 'three'

export class GeoLayer {
  /**
     * @param {String} name name of the layer
     * @param {Object} geojson geojson data json object
     * @public
    */

  constructor (name, geojson) {
    this.geojson = geojson.features
    this.name = name

    // Main Layer
    this.layer = new Layer(name)

    this.materials = []

    // Object Group
    this.layer_objects = new Layer(name + '_objects')

    // Borders Group (if needed)
    this.layer_borders = new Layer(name + '_borders')

    // Collider Group (if needed)
    this.layer_colliders = new Layer(name + '_colliders')
    this.layer.Layer().CUBE_COLLIDER = { enabled: false, colliders: [] }

    // Set type
    this.layer.Layer().CUBE_TYPE = 'GeoLayer'
  }

  /**
     * @param {Object} options {merge: Boolean, border: Boolean, collider: Boolean, height: Number} merge: if use merge function to optimise performance, border: if generate border, collider: if load invisible collider when merge is true, no function if choose not merge, height: height value
     * @param {THREE.Material} mat_line replace line material
     * @param {THREE.Material} mat_map replace map main material
     * @public
    */

  AdministrativeMap (options = {}, matMap, matLine) {
    // Replace material
    this.mat_map = matMap || new CUBE_Material().GeoMap()
    this.mat_line = matLine || new CUBE_Material().GeoBorder()

    // Register material
    this.materials.push(this.mat_map)
    this.materials.push(this.mat_line)

    const features = this.geojson
    const height = options.height ? options.height : 2

    const geometries = []

    // if merge is false, force collider to false
    options.collider = options.merge ? options.collider : false

    // Render all buildings
    for (let i = 0; i < features.length; i++) {
      const fel = features[i]

      // Just in case properties value does not exist
      if (!fel.properties) return

      const info = fel.properties

      // Only render when geometry is Polygon
      // Render building
      if (fel.geometry.coordinates) {
        let coors = []

        if (fel.geometry.type === 'Polygon') {
          coors.push(fel.geometry.coordinates)
        }

        if (fel.geometry.type === 'MultiPolygon') {
          coors = fel.geometry.coordinates
        }

        for (let i = 0; i < coors.length; i++) {
          const coor = coors[i]
          const province = addProvince(coor, info, options.collider, height)

          if (province) {
            if (options.merge) {
              geometries.push(province.geometry)
              if (options.collider) this.layer_colliders.Add(province.helper)
            } else {
              this.layer_objects.Add(new THREE.Mesh(province.geometry, this.mat_map))
            }
          }

          if (options.border) this.layer_borders.Add(addBorder(coor, this.mat_line, height + 0.01))
        }
      }
    }

    // Merge geometry for performance
    if (options.merge) {
      const mergedGeometry = MergeGeometry(geometries)
      const provinceMesh = new THREE.Mesh(mergedGeometry, this.mat_map)
      this.layer_objects.Add(provinceMesh)
    }

    this.layer.Add(this.layer_objects.Layer())
    if (options.collider) {
      this.layer.Layer().CUBE_COLLIDER.colliders = this.layer_colliders.Layer()
      this.layer.Layer().CUBE_COLLIDER.enabled = true
    }
    this.layer.Add(this.layer_borders.Layer())

    return this.layer.Layer()
  }

  /**
     * @param {Object} options {merge: Boolean, color: 0xffffff, collider: Boolean, terrain: CUBE.Terrain()} merge: if use merge function to optimise performance, color: color, collider: if load invisible collider when merge is true, terrain: CUBE.Terrain() object
     * @param {THREE.Material} mat replace building material
     * @public
    */

  Buildings (options = {}, mat) {
    const terrain = options.terrain ? options.terrain.children[0].geometry : false
    if (options.terrain) console.warn('Building with terrain is an experimental function. In some case, it might cause performance issue and memory leak.')

    // Replace material
    this.mat_building = mat || new CUBE_Material().GeoBuilding({ color: options.color ? options.color : 0x7884B2, specular: 0xfafafa, reflectivity: 0.6 })

    // Register material
    this.materials.push = this.mat_building

    const features = this.geojson

    const geometries = []

    // if merge is false, force collider to false
    if (!options.collider) options.collider = false
    else options.collider = options.merge ? options.collider : false
    // Render all building
    for (let i = 0; i < features.length; i++) {
      const fel = features[i]

      // Just in case properties value does not exist
      if (!fel.properties) return

      const info = fel.properties
      const tags = verify(info, 'building')

      // Only render when geometry is Polygon
      if (tags && fel.geometry.type === 'Polygon') {
        let levels = 1

        if (info['building:levels'] !== undefined) {
          levels = parseInt(info['building:levels'])
        } else if (info.tags) {
          levels = parseInt(info.tags['building:levels'])
        }

        const building = addBuilding(fel.geometry.coordinates, options.collider, info, levels, terrain)

        if (building) {
          if (options.merge) {
            geometries.push(building.geometry)
            if (options.collider) this.layer_colliders.Add(building.helper) // Invisiable collider
          } else {
            const mesh = new THREE.Mesh(building.geometry, this.mat_building)
            const n = verify(info, 'name')
            mesh.name = n || 'building'
            mesh.info = info
            this.layer_objects.Add(mesh)
          }
        }
      }
    }

    // Merge geometry for performance
    if (options.merge) {
      const mergedGeometry = MergeGeometry(geometries)
      const buildingsMesh = new THREE.Mesh(mergedGeometry, this.mat_building)
      this.layer_objects.Add(buildingsMesh)
    }

    this.layer.Add(this.layer_objects.Layer())

    // Add collider
    if (options.collider) {
      // this.layer.Add(this.layer_colliders.Layer()) // Helper debug
      this.layer.Layer().CUBE_COLLIDER.colliders = this.layer_colliders.Layer()
      this.layer.Layer().CUBE_COLLIDER.enabled = true
    }

    return this.layer.Layer()
  }

  /**
     * Line merged, high preformance
     * @param {Object} options {color: 0xffffff}
     * @param {THREE.Color} options.color - 16 hex color: 0x1b4686
     * @param {THREE.Object3D} options.terrain - Terrain Object
     * @param {THREE.Material} mat replace road material
     * @public
    */

  Road (options = {color: 0x1B4686, terrain: null, width: 2, color: 0x4287f5 }, mat) {
    const features = this.geojson

    this.mat_road = new CUBE_Material().GeoRoad({ color: options.color ? options.color : 0x1B4686 })

    // Terrain
    const terrain = options.terrain ? options.terrain.children[0].geometry : false

    let allPoints = []
    let allCurves = [];

    // Replace material interface
    this.mat_road = mat || this.mat_road

    // Registry material
    this.materials.push(this.mat_road)

    for (let i = 0; i < features.length; i++) {
      const fel = features[i]

      // Just in case properties value does not exist
      if (!fel.properties) return

      const info = fel.properties

      // Only render when geometry is Polygon
      const tags = verify(info, 'highway')

      if (tags) {
        // Render Roads
        if (fel.geometry.type === 'LineString' && tags !== 'pedestrian' && tags !== 'footway' && tags !== 'path') {
          const road = addRoad3(fel.geometry.coordinates, terrain)
          if (road) {
            // allPoints = allPoints.concat(road)
            allPoints.push(road);
          }
        }
      }
    }

    // 2021.06.15 Major Updates: Geometry to Buffer Geometry. from using 'push each to geometry.vertexs' method change to setFromPoints method
    // AND allow fat line created by TubeGeometry and CurvePath

    // 2021.06.16 Major Updates: Use Line Geometry to support fat line for realistic highway generation
    
    for(let ip=0;ip<allPoints.length;ip++) {
      const ipp = allPoints[ip]

      const geometry = new LineGeometry()
    
      const positions = []
      const divisions = Math.round( 24 * ipp.length )
      const spline = new THREE.CatmullRomCurve3( ipp, false, 'catmullrom', .001 )
      const point = new THREE.Vector3()

      for(let iipp = 0, l = divisions; iipp < l; iipp ++) {
        const t = iipp / l
        spline.getPoint( t, point )
        positions.push(point.x, point.y, point.z)
        
      }
      
      geometry.setPositions( positions )
      geometry.rotateZ(Math.PI)

      const widthScale = window.CUBE_GLOBAL.MAP_SCALE * (options.width || 2)

      const matLine = new LineMaterial( {

        color: options.color || 0x4287f5,
        linewidth: widthScale * .0001, // in pixels
        vertexColors: false,
        //resolution:  // to be set by renderer, eventually
        dashed: false,
        alphaToCoverage: true,
  
      } );
  
      const line = new Line2( geometry, matLine );
      line.computeLineDistances()
      // line.position.set(line.position.x, 1, line.position.z);
      line.matrixAutoUpdate = false
      line.updateMatrix()
  
      this.layer_objects.Add(line)
    }
    
    this.layer.Add(this.layer_objects.Layer())

    return this.layer.Layer()
  }

  /**
     * Line un-merged poor preformance
     * @param {Object} options {color: 0xffffff, animation: CUBE.Animation, instance: CUBE.Space} merge: if use merge function to optimise performance
     * @param {THREE.Material} mat replacement material
     * @public
    */

  RoadSp (options = {}, mat) {
    const features = this.geojson
    this.mat_road = new CUBE_Material().GeoRoad()

    // Terrain
    const terrain = options.terrain ? options.terrain.children[0].geometry : false

    // Replace material interface
    this.mat_road = mat || this.mat_road

    // Register material
    this.materials.push(this.mat_road)

    for (let i = 0; i < features.length; i++) {
      const fel = features[i]

      // Just in case properties value does not exist
      if (!fel.properties) return

      const info = fel.properties
      // Only render when geometry is Polygon
      const tags = verify(info, 'highway')

      if (tags) {
        // Render Roads
        if (fel.geometry.type === 'LineString' && tags !== 'pedestrian' && tags !== 'footway' && tags !== 'path') {
          const road = addRoad(fel.geometry.coordinates, terrain)

          if (road) {
            // Add line
            const line = new THREE.Line(road.geometry, this.mat_road)
            line.info = info

            // Adjust position
            line.position.set(line.position.x, 1, line.position.z)

            // Disable matrix auto update for performance
            line.matrixAutoUpdate = false
            line.updateMatrix()

            // If Animation Activated
            if (options.animation && options.animationEngine) {
              line.computeLineDistances()
              const lineLength = line.geometry.attributes.lineDistance.array[line.geometry.attributes.lineDistance.count - 1]
              if (lineLength > 0.8) {
                const aniLine = addAnimatedLine(line.geometry, lineLength)
                const lineAni = new Animation('l', aniLine, 'dashline').DashLine(lineLength)
                options.animationEngine.Register(lineAni)
              }
            }

            this.layer_objects.Add(line)
          }
        }
      }
    }

    this.layer.Add(this.layer_objects.Layer())

    return this.layer.Layer()
  }

  /**
     * Water
     * @param {Object} options {color: 0xffffff} merge: if use merge function to optimise performance
     * @public
    */

  Water (options = {}) {
    const sun = new THREE.Light('#ffffff', 0.5)
    sun.position.set(0, 4, 0)
    const matWater = new CUBE_Material().GeoWater(sun, true)

    const features = this.geojson

    const geometries = []

    for (let i = 0; i < features.length; i++) {
      const fel = features[i]
      if (!fel.properties) return

      const tags = verify(fel.properties, 'natural')
      if (tags === 'water' && fel.geometry.type === 'Polygon') {
        const water = addWater(fel.geometry.coordinates, fel.properties)
        if (options.merge) {
          geometries.push(water.geometry)
        } else {
          const mesh = new Water(water.geometry, matWater)
          this.layer.Add(mesh)
        }
      }
    }

    if (options.merge) {
      const merged = MergeGeometry(geometries)
      const mesh = new Water(merged, matWater)
      this.layer.Add(mesh)
    }

    return this.layer.Layer()
  }

  /**
     * Custom Polygon
     * @param {Object} options {color: 0xffffff, height: Number, merge: Boolean} color: color merge: if use merge function to optimise performance
     * @param {THREE.Material} mat replacement material
     * @public
    */

  Polygon (options = {}, mat) {
    // Replace material?
    this.mat = mat || new CUBE_Material().GeoMap({ color: options.color ? options.color : 0x2E3342 })

    // Register material
    this.materials.push(this.mat)

    const features = this.geojson

    const height = options.height ? options.height : 1

    const geometries = []

    // Render all buildings
    for (let i = 0; i < features.length; i++) {
      const fel = features[i]

      // Just in case properties value does not exist
      if (!fel.properties) return

      const info = fel.properties

      // Only render when geometry is Polygon
      // Render building
      if (fel.geometry.coordinates) {
        const coors = []

        if (fel.geometry.type === 'Polygon') {
          coors.push(fel.geometry.coordinates)
        }

        for (let i = 0; i < coors.length; i++) {
          const coor = coors[i]
          const poly = addBuilding(coor, false, info, height)

          if (poly) {
            if (options.merge) {
              geometries.push(poly.geometry)
            } else {
              this.layer_objects.Add(new THREE.Mesh(poly.geometry, this.mat))
            }
          }
        }
      }
    }

    // Merge geometry for performance
    if (options.merge) {
      const mergedGeometry = MergeGeometry(geometries)
      const provinceMesh = new THREE.Mesh(mergedGeometry, this.mat)
      this.layer_objects.Add(provinceMesh)
    }

    this.layer.Add(this.layer_objects.Layer())
    // this.layer.Add(this.layer_colliders.Layer())
    this.layer.Add(this.layer_borders.Layer())

    return this.layer.Layer()
  }
}

function addBuilding (coordinates, collider = false, info = {}, height = 1, terrain) {
  height = height || 1

  let shape
  const holes = []

  for (let i = 0; i < coordinates.length; i++) {
    const el = coordinates[i]

    if (i === 0) {
      shape = GenShape(el)
    } else {
      holes.push(GenShape(el))
    }
  }

  for (let i = 0; i < holes.length; i++) {
    shape.holes.push(holes[i])
  }

  const geometry = GenGeometry(shape, { curveSegments: 1, depth: 0.1 * height, bevelEnabled: false })
  geometry.rotateX(Math.PI / 2)
  geometry.rotateZ(Math.PI)
  geometry.computeBoundingSphere()

  // adjust altitude if has terrain data
  if (terrain) {
    const vector = new THREE.Vector3(shape.currentPoint.x, 0, shape.currentPoint.y)
    const axis = new THREE.Vector3(0, 0, 1)
    const angle = Math.PI
    vector.applyAxisAngle(axis, angle)
    const dem = shortEst({ x: vector.x, z: vector.z }, terrain.vertices)
    if (dem) { geometry.translate(0, dem.y, 0) }
  }

  // Generate invisible helper if needed
  let helper = {}
  if (collider) {
    helper = GenHelper(geometry)
    if (helper) {
      const n = verify(info, 'name')
      helper.name = n || 'building'
      helper.info = info
    }
  }

  return {
    geometry: geometry,
    helper: helper
  }
}

function addProvince (coordinates, info, collider = false, height = 1) {
  let shape, geometry
  // Loop for all nodes
  for (let i = 0; i < coordinates.length; i++) {
    const el = coordinates[i]
    if (typeof el[0][0] !== 'number') {
      shape = GenShape(el[0])
    } else {
      shape = GenShape(el)
    }
  }

  if (shape) {
    // Extrude Shape to Geometry
    geometry = GenGeometry(shape, {
      curveSegments: 12, // curves
      steps: 1, // subdividing segments
      depth: height, // Height
      bevelEnabled: false // Bevel (round corner)
    })

    // Adjust geometry rotation
    geometry.rotateX(Math.PI / 2)
    geometry.rotateZ(Math.PI)
    geometry.computeBoundingSphere()

    // Generate invisible helper if needed
    let helper = {}
    if (collider) {
      helper = GenHelper(geometry)
      if (helper) {
        const n = verify(info, 'name')
        helper.name = n || 'Area'

        helper.info = info
      }
    }

    return { geometry: geometry, helper: helper }
  }
}

function addRoad (d, terrain) {
  // Init points array
  const points = []

  // Loop for all nodes
  for (let i = 0; i < d.length; i++) {
    if (!d[0][1]) return

    const el = d[i]

    // Just in case
    if (!el[0] || !el[1]) return

    let elp = [el[0], el[1]]

    // convert position from the center position
    elp = new Coordinate('GPS', { latitude: elp[1], longitude: elp[0] }).ComputeWorldCoordinate()

    // WAIT FOR MERGE adjust height according to terrain data
    // Rotate
    const vector = new THREE.Vector3(elp.world.x, elp.world.y, elp.world.z)
    const axis = new THREE.Vector3(0, 0, 1)
    const angle = Math.PI

    vector.applyAxisAngle(axis, angle)

    let y = 0

    if (terrain) {
      const dem = shortEst({ x: vector.x, z: vector.z }, terrain.vertices)
      if (dem) {
        y = -dem.y
      }
    }

    // Draw Line
    points.push(new THREE.Vector3(elp.world.x, elp.world.y + y, elp.world.z))
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points)

  // Adjust geometry rotation
  geometry.rotateZ(Math.PI)

  return { geometry: geometry }
}

function addRoad3 (d, terrain) {
  // let state = false

  const points = []

  // Loop for all nodes
  for (let i = 0; i < d.length; i++) {
    if (!d[0][1]) return

    const el = d[i]

    // Just in case
    if (!el[0] || !el[1]) return

    let elp = [el[0], el[1]]

    // convert position from the center position
    elp = new Coordinate('GPS', { latitude: elp[1], longitude: elp[0] }).ComputeWorldCoordinate()

    // WAIT FOR MERGE adjust height according to terrain data
    // Rotate
    const vector = new THREE.Vector3(elp.world.x, elp.world.y, elp.world.z)
    const axis = new THREE.Vector3(0, 0, 1)
    const angle = Math.PI

    vector.applyAxisAngle(axis, angle)

    let y = 0

    if (terrain) {
      const dem = shortEst({ x: vector.x, z: vector.z }, terrain.vertices)
      if (dem) {
        y = -dem.y
      }
    }

    // Draw Line in Pair [1,1], [1,2], [1,2], [2,5], [2,5], [3,6]
    points.push(new THREE.Vector3(elp.world.x, elp.world.y + y, elp.world.z))
    if (i !== 0 && i !== d.length - 1) points.push(new THREE.Vector3(elp.world.x, elp.world.y + y, elp.world.z))
  }

  return points
}

function addRoadFat(d, terrain) {
  const curves = new CurvePath();
  let lastPoint = null;

  // Loop for all nodes
  for (let i = 0; i < d.length; i++) {
    if (!d[0][1]) return

    const el = d[i]

    // Just in case
    if (!el[0] || !el[1]) return

    let elp = [el[0], el[1]]

    // convert position from the center position
    elp = new Coordinate('GPS', { latitude: elp[1], longitude: elp[0] }).ComputeWorldCoordinate()

    // WAIT FOR MERGE adjust height according to terrain data
    // Rotate
    const vector = new THREE.Vector3(elp.world.x, elp.world.y, elp.world.z)
    const axis = new THREE.Vector3(0, 0, 1)
    const angle = Math.PI

    vector.applyAxisAngle(axis, angle)

    let y = 0

    if (terrain) {
      const dem = shortEst({ x: vector.x, z: vector.z }, terrain.vertices)
      if (dem) {
        y = -dem.y
      }
    }

    // Draw Line in Pair [1,1], [1,2], [1,2], [2,5], [2,5], [3,6]
    const thisPoint = new THREE.Vector3(elp.world.x, elp.world.y + y, elp.world.z);
    if(lastPoint) {
      const curve = new THREE.LineCurve3(lastPoint, thisPoint)
      curves.add(curve)
    }
    lastPoint = thisPoint;
    // if (i !== 0 && i !== d.length - 1) points.push(new THREE.Vector3(elp.world.x, elp.world.y + y, elp.world.z))
  }

  return curves
}

function addBorder (coordinates, material, up) {
  const points = []

  for (let i = 0; i < coordinates.length; i++) {
    if (i === 0) {
      const el = coordinates[i]

      for (let ii = 0; ii < el.length; ii++) {
        let elp = el[ii]
        elp = new Coordinate('GPS', { latitude: elp[1], longitude: elp[0] }).ComputeWorldCoordinate()
        points.push(new THREE.Vector3(elp.world.x, elp.world.y, elp.world.z))
      }
    }
  }

  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  geometry.rotateZ(Math.PI)

  const line = new THREE.Line(geometry, material)
  line.position.set(0, up, 0)
  line.material.transparent = true

  return line
}

function addWater (d) {
  const holes = []
  let shape

  for (let i = 0; i < d.length; i++) {
    const el = d[i]
    if (i === 0) {
      shape = GenShape(el)
    } else {
      holes.push(GenShape(el))
    }
  }

  // Punch a hole
  for (let h = 0; h < holes.length; h++) {
    shape.holes.push(holes[h])
  }

  const geometry = GenWaterGeometry(shape, {
    curveSegments: 2, // curves
    steps: 1, // subdividing segments
    depth: 0.01, // Height
    bevelEnabled: false // Bevel (round corner)
  })

  // geometry.rotation.x = - Math.PI / 2;

  // Adjust geometry rotation
  geometry.rotateX(Math.PI / 2)
  geometry.rotateZ(Math.PI)
  geometry.computeBoundingSphere()

  return { geometry: geometry }
}

function shortEst (target, arr) {
  let resDis = 100000 // Save distance
  let res = false // default return

  for (let i = 0; i < arr.length; i++) { // loop all terrain data
    const dis = Math.sqrt(Math.pow((target.x - arr[i].x), 2) + Math.pow((target.z - arr[i].z), 2)) // get distance from target distance to terrain geometry data
    if (dis <= resDis) { // if distance less than resDis
      resDis = dis // save new distance
      res = arr[i] // save terrain geometry data
    }
  }

  return res
}

function verify (properties, key = 'building') {
  let tags = false
  if (properties[key] !== undefined) {
    tags = properties[key]
  } else if (properties.tags && properties.tags[key] !== undefined) {
    tags = properties.tags[key]
  }

  return tags
}

function addAnimatedLine (geometry, length, color = 0x00FFFF) {
  const animatedLine = new THREE.Line(geometry, new THREE.LineDashedMaterial({ color: color }))
  animatedLine.material.transparent = true
  animatedLine.material.dashSize = 0
  animatedLine.material.gapSize = length + 10

  return animatedLine
}

/**
 * Fat Line (reserved)
 * @param {Object} options {color: 0xffffff} merge: if use merge function to optimise performance
 * @param {THREE.Material} mat replace building material
 * @public
*/

// INSIDE CLASSES   Road2(options={}, mat){
//     let features = this.geojson

//     this.mat_road = new LineMaterial({

//         color: 0xffffff,
//         linewidth: 5, // in pixels
//         vertexColors: false,
//         //resolution:  // to be set by renderer, eventually
//         dashed: false

//     })

//     this.mat_road.resolution.set( window.innerWidth, window.innerHeight );

//     // Register material
//     this.materials.push(this.mat_road)

//     for(let i=0;i<features.length;i++){
//         let fel = features[i]

//         // Just in case properties value does not exist
//         if(!fel["properties"]) return

//         let info = fel["properties"]
//         //let selectTags = info.tags ? "tags" : "properties"
//         // Only render when geometry is Polygon
//         let tags = verify(info, "highway")

//         if(tags){
//             // Render Roads
//             if(fel.geometry.type == "LineString" && tags != "pedestrian" && tags != "footway" && tags != "path"){
//                 let road = addRoad2(fel.geometry.coordinates)
//                 if(road){
//                     let line = new Line2( road.geometry, this.mat_road )
//                     line.computeLineDistances()
//                     line.info = info

//                     //Adjust position
//                     line.position.set(line.position.x, 1, line.position.z)

//                     this.layer_objects.Add(line)
//                 }
//             }
//         }
//     }

//     this.layer.Add(this.layer_objects.Layer())

//     return this.layer.Layer()
// }

// function addRoad2(d){

//     // Init points array
//     let points = []

//     // Loop for all nodes
//     for(let i=0;i<d.length;i++){

//         if(!d[0][1]) return

//         let el = d[i]

//         //Just in case
//         if(!el[0] || !el[1]) return

//         let elp = [el[0], el[1]]

//         //convert position from the center position
//         elp = new Coordinate("GPS", {latitude: elp[1], longitude: elp[0]}).ComputeWorldCoordinate()
//         //elp = ThreeBasic.GPSRelativePosition({latitude: elp[1], longitude: elp[0]}, this.Center)

//         // WAIT FOR MERGE adjust height according to terrain data
//         // Rotate
//         let vector = new THREE.Vector3( elp.world.x, elp.world.y, elp.world.z )
//         let axis = new THREE.Vector3( 0, 0, 1 )
//         let angle = Math.PI

//         vector.applyAxisAngle( axis, angle )

//         // // Fit Terrain
//         // let dem = this.ShortEst({x: vector.x, z: vector.z}, this.terrainData.vertices)

//         // //console.log(dem.y)
//         // let y
//         // if(dem) {y = -dem.y} else {y = 0.5}

//         // Draw Line
//         points.push( elp.world.x, elp.world.y + 1, elp.world.z  )

//     }
//     // let geometry
//     let geometry = new LineGeometry().setPositions(points)
//     geometry.rotateZ(Math.PI)

//     return {geometry: geometry}
// }
