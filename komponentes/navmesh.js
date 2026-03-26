/* global AFRAME, THREE */

/**
 * Navigation Mesh Component
 * 
 * Constrains entity movement to follow the surface of specified geometry (navmesh).
 * Prevents players from walking through walls and keeps them grounded on terrain.
 * 
 * ============================================================================
 * USAGE EXAMPLES:
 * ============================================================================
 * 
 * Example 1: Basic usage with WASD controls
 * ------------------------------------------
 * <a-entity wasd-controls navmesh="navmesh: #ground-mesh"></a-entity>
 * 
 * 
 * Example 2: Custom player height (e.g., for VR camera)
 * ------------------------------------------------------
 * <a-entity camera look-controls wasd-controls 
 *           navmesh="navmesh: #terrain; height: 1.8">
 * </a-entity>
 * 
 * 
 * Example 3: Multiple navmesh surfaces (using classes)
 * -------------------------------------
 * <a-entity wasd-controls 
 *           navmesh="navmesh: .ground, .platform, .stairs">
 * </a-entity>
 * 
 * 
 * Example 4: With obstacle exclusion (avoid walking through specific objects)
 * ----------------------------------------------------------------------------
 * <a-entity wasd-controls 
 *           navmesh="navmesh: #floor; 
 *                    exclude: .wall, .furniture, .obstacle">
 * </a-entity>
 * 
 * 
 * Example 5: Custom fall distance and height
 * -------------------------------------------
 * <a-entity wasd-controls 
 *           navmesh="navmesh: #ground; 
 *                    fall: 2.0; 
 *                    height: 1.6">
 * </a-entity>
 * <!-- fall: 2.0 means player can fall up to 2 meters before stopping -->
 * 
 * 
 * Example 6: Disable/enable dynamically via JavaScript
 * -----------------------------------------------------
 * <a-entity id="player" wasd-controls navmesh="navmesh: #floor"></a-entity>
 * 
 * <script>
 *   // Disable navmesh constraint
 *   document.querySelector('#player').setAttribute('navmesh', 'enabled', false);
 *   
 *   // Re-enable navmesh constraint
 *   document.querySelector('#player').setAttribute('navmesh', 'enabled', true);
 * </script>
 * 
 * 
 * Example 7: Using with a custom origin point (for complex rigs)
 * ---------------------------------------------------------------
 * <a-entity id="player-rig">
 *   <a-entity id="camera-holder" camera look-controls 
 *             navmesh="navmesh: #terrain; 
 *                      xzOrigin: #player-rig">
 *   </a-entity>
 * </a-entity>
 * 
 * 
 * Example 8: Complete scene setup
 * --------------------------------
 * <a-scene>
 *   <!-- Ground mesh that serves as navmesh -->
 *   <a-plane id="ground-mesh" rotation="-90 0 0" width="50" height="50" 
 *            color="#7BC8A4" class="ground"></a-plane>
 *   
 *   <!-- Obstacles to avoid -->
 *   <a-box class="obstacle" position="0 0.5 -3" color="#FF5733"></a-box>
 *   <a-cylinder class="obstacle" position="2 0.5 -4" radius="0.5"></a-cylinder>
 *   
 *   <!-- Player with navmesh -->
 *   <a-entity camera look-controls wasd-controls 
 *             position="0 1.6 0"
 *             navmesh="navmesh: .ground; 
 *                      exclude: .obstacle; 
 *                      height: 1.6; 
 *                      fall: 1.0">
 *   </a-entity>
 * </a-scene>
 * 
 * ============================================================================
 */
AFRAME.registerComponent('navmesh', {
  schema: {
    // Enable/disable navmesh constraint
    enabled: {
      default: true
    },
    // CSS selector for navmesh geometry elements
    navmesh: {
      default: ''
    },
    // Maximum fall distance before stopping (0 = infinite fall)
    fall: {
      default: 0.5
    },
    // Player height above ground surface
    height: {
      default: 1.6
    },
    // CSS selector for objects to exclude/avoid (obstacles)
    exclude: {
      default: ''
    },
    // Element to use as XZ origin (default: this element)
    xzOrigin: {
      default: ''
    }
  },
  
  update: function () {
    this.lastPosition = null;
    this.excludes = this.data.exclude ? Array.from(document.querySelectorAll(this.data.exclude)):[];
    const els = Array.from(document.querySelectorAll(this.data.navmesh));
    if (els === null) {
      console.warn('navmesh-physics: Did not match any elements');
      this.objects = [];
    } else {
      this.objects = els.map(el => el.object3D).concat(this.excludes.map(el => el.object3D));
    }
    this.xzOrigin = this.data.xzOrigin ? this.el.querySelector(this.data.xzOrigin) : this.el;
  },

  /**
   * Main physics loop - runs every frame
   * Handles surface detection, collision, and gravity
   */
  tick: (function () {
    // Reusable vectors for performance
    const nextPosition = new THREE.Vector3();
    const tempVec = new THREE.Vector3();
    
    // Scanning pattern: [angle in degrees, distance multiplier]
    // Tries multiple directions to find valid surface when movement is blocked
    const scanPattern = [
      [0,1],      // Primary direction - full distance
      [0,0.5],    // Same direction - half distance (path validation)
      [30,0.4],   // 30° right - reduced distance
      [-30,0.4],  // 30° left - reduced distance  
      [60,0.2],   // 60° right - short range
      [-60,0.2],  // 60° left - short range
      [80,0.06],  // Nearly perpendicular right - very short
      [-80,0.06], // Nearly perpendicular left - very short
    ];
    
    // Physics constants
    const down = new THREE.Vector3(0,-1,0);
    const raycaster = new THREE.Raycaster();
    const gravity = -1;          // Gravity acceleration
    const maxYVelocity = 0.5;    // Terminal velocity
    const results = [];          // Raycast results array
    let yVel = 0;               // Current Y velocity
    let firstTry = true;        // Flag for initial positioning
    
    return function tick(time, delta) {
      // Skip if component is disabled
      if (this.data.enabled === false) return;
      
      // Initialize position tracking on first run
      if (this.lastPosition === null) {
        firstTry = true;
        this.lastPosition = new THREE.Vector3();
        this.xzOrigin.object3D.getWorldPosition(this.lastPosition);
        if (this.data.xzOrigin) this.lastPosition.y -= this.xzOrigin.object3D.position.y;
      }
      
      const el = this.el;
      // Skip if no navmesh objects are available
      if (this.objects.length === 0) return;

      // Get current world position
      this.xzOrigin.object3D.getWorldPosition(nextPosition);
      if (this.data.xzOrigin) nextPosition.y -= this.xzOrigin.object3D.position.y;
      
      // Skip if position hasn't changed significantly (optimization)
      if (nextPosition.distanceTo(this.lastPosition) <= 0.01) return;
      
      let didHit = false;
      
      // Try multiple scan directions to find valid surface
      // Prevents getting stuck when direct path is blocked
      scanPatternLoop:
      for (const [angle, distance] of scanPattern) {
        // Calculate scan direction based on movement vector
        tempVec.subVectors(nextPosition, this.lastPosition);
        tempVec.applyAxisAngle(down, angle*Math.PI/180);  // Rotate by scan angle
        tempVec.multiplyScalar(distance);                 // Scale by distance factor
        tempVec.add(this.lastPosition);                   // Add to last position
        
        // Set raycast start position (above ground + max fall velocity)
        tempVec.y += maxYVelocity;
        tempVec.y -= this.data.height;
        
        // Configure raycaster for downward cast
        raycaster.set(tempVec, down);
        raycaster.far = this.data.fall > 0 ? this.data.fall + maxYVelocity : Infinity;
        
        // Perform raycast to find ground
        raycaster.intersectObjects(this.objects, true, results);
        
        if (results.length) {
          // Check if hit object is in exclusion list (obstacle avoidance)
          for (const result of results) {
            if(this.excludes.includes(result.object.el)) {
              results.splice(0);  // Clear results
              continue scanPatternLoop;  // Try next scan direction
            }
          }
          
          // Valid surface found - calculate new position
          const hitPos = results[0].point;
          results.splice(0);  // Clear results array
          
          // Add player height offset to ground position
          hitPos.y += this.data.height;
          
          // Apply gravity if player is above ground
          if (nextPosition.y - (hitPos.y - yVel*2) > 0.01) {
            // Increase downward velocity (gravity)
            yVel += Math.max(gravity * delta * 0.001, -maxYVelocity);
            hitPos.y = nextPosition.y + yVel;
          } else {
            // On ground - reset velocity
            yVel = 0;
          }
          
          // Convert world position to local coordinates
          tempVec.copy(hitPos);
          this.xzOrigin.object3D.parent.worldToLocal(tempVec);
          tempVec.sub(this.xzOrigin.object3D.position);
          if (this.data.xzOrigin) tempVec.y += this.xzOrigin.object3D.position.y;
          
          // Apply position change to entity
          this.el.object3D.position.add(tempVec);
          
          // Update last known good position
          this.lastPosition.copy(hitPos);
          didHit = true;
          break;  // Exit scan loop - valid position found
        }
        
      }
      
      // Update initialization state
      if (didHit) {
        firstTry = false;
      }
      
      // If no valid surface found and not first attempt, revert to last good position
      if (!firstTry && !didHit) {
        this.el.object3D.position.copy(this.lastPosition);
        this.el.object3D.parent.worldToLocal(this.el.object3D.position);
      }
    }
  }())
});