/**
 * A-Frame Lightmap Component
 * 
 * Compatible with A-Frame 1.7 and Three.js r173
 * 
 * Usage:
 * Assign to GLB objects with lightmap data
 * lightmap__YourName="texture: #IDOfImageASSET; key: NameOfMaterial"
 * 
 * Requirements:
 * - A second UV map (uv1) for the 3D model
 * - Lightmap texture asset loaded in A-Frame scene
 * - Material name matching the key parameter
 * 
 * Examples:
 * 
 * 1. Basic single lightmap:
 *    <a-assets>
 *      <img id="roomLightmap" src="lightmaps/room-bake.jpg">
 *      <a-asset-item id="roomModel" src="models/room.glb"></a-asset-item>
 *    </a-assets>
 *    <a-entity gltf-model="#roomModel" 
 *              lightmap="texture: #roomLightmap; key: RoomMaterial">
 *    </a-entity>
 * 
 * 2. Multiple lightmaps for different materials:
 *    <a-assets>
 *      <img id="floorLightmap" src="lightmaps/floor.jpg">
 *      <img id="wallLightmap" src="lightmaps/walls.jpg">
 *      <a-asset-item id="buildingModel" src="models/building.glb"></a-asset-item>
 *    </a-assets>
 *    <a-entity gltf-model="#buildingModel"
 *              lightmap__floor="texture: #floorLightmap; key: Floor"
 *              lightmap__walls="texture: #wallLightmap; key: Walls">
 *    </a-entity>
 * 
 * 3. Material with pipe-separated names (multiple materials sharing one lightmap):
 *    In Blender, name material: "Wood|Furniture|Props"
 *    <a-entity gltf-model="#furniture"
 *              lightmap="texture: #furnitureLightmap; key: Wood">
 *    </a-entity>
 *    This will apply the lightmap to all materials containing "Wood" in their name.
 */

AFRAME.registerComponent("lightmap", {
    multiple: true,
    schema: {
        // keep as asset so A-Frame resolves the element; it's the <img> element
        texture: { type: "asset", default: "" },
        key: { type: "string", default: "" },
        intensity: { type: "number", default: 1.0 }
    },
    init: function () {
        var self = this;

        console.log(
            "lightmap component initialized",
            self.data.texture,
            self.data.key
        );

        this.el.addEventListener("model-loaded", () => {
            var textureEl = self.data.texture;
            if (!textureEl || !textureEl.src) {
                console.error('Lightmap texture not found or invalid:', self.data.texture);
                return;
            }

            console.log('Creating lightmap texture from image element:', textureEl.src);

            // Create THREE.Texture from the image element for Three.js r173 / A-Frame 1.7
            var texture = new THREE.Texture(textureEl);
            texture.flipY = false;
            texture.channel = 1; // use uv1
            texture.needsUpdate = true;

            // Color space / encoding for lightmaps in newer Three.js
            if (typeof THREE.LinearSRGBColorSpace !== 'undefined') {
                texture.colorSpace = THREE.LinearSRGBColorSpace;
            }
            // encoding is still useful for some builds
            if (typeof THREE.sRGBEncoding !== 'undefined') {
                texture.encoding = THREE.sRGBEncoding;
            }

            // sensible texture parameters
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.magFilter = THREE.LinearFilter;
            texture.minFilter = THREE.LinearMipMapLinearFilter;
            texture.generateMipmaps = true;

            console.log('Lightmap texture prepared');

            var obj = self.el.object3D;
            var applied = false;

            obj.traverse((node) => {
                if (node.isMesh) {
                    var matName = (node.material && node.material.name) ? node.material.name : '';
                    var matArguments = matName.split("|");

                    matArguments.forEach((element) => {
                        if (element === self.data.key) {
                            console.log('Applying lightmap to material:', matName);

                            node.material.lightMap = texture;
                            node.material.lightMapIntensity = self.data.intensity;
                            node.material.needsUpdate = true;

                            // Ensure shader knows to use the lightmap (some builds require this)
                            if (!node.material.defines) node.material.defines = {};
                            node.material.defines.USE_LIGHTMAP = '';

                            applied = true;
                        }
                    });
                }
            });

            if (!applied) {
                console.warn('No material found with key:', self.data.key);
                console.log('Available materials in model:');
                obj.traverse((node) => {
                    if (node.isMesh) {
                        console.log('  - Material name:', node.material && node.material.name);
                    }
                });
            }
        });
    },
});

// Debug component - applies lightmap to ALL materials (useful for testing)
AFRAME.registerComponent("lightmap-test", {
    schema: {
        texture: { type: "asset", default: "" },
        intensity: { type: "number", default: 1.0 }
    },
    init: function () {
        var self = this;

        console.log("lightmap-test component initialized", self.data.texture);

        this.el.addEventListener('model-loaded', () => {
            var textureEl = self.data.texture;
            if (!textureEl || !textureEl.src) {
                console.error('Lightmap texture not found or invalid:', self.data.texture);
                return;
            }

            console.log('Creating lightmap texture from image element (test):', textureEl.src);

            var texture = new THREE.Texture(textureEl);
            texture.flipY = false;
            texture.channel = 1;
            texture.needsUpdate = true;

            if (typeof THREE.LinearSRGBColorSpace !== 'undefined') {
                texture.colorSpace = THREE.LinearSRGBColorSpace;
            }
            if (typeof THREE.sRGBEncoding !== 'undefined') {
                texture.encoding = THREE.sRGBEncoding;
            }
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.magFilter = THREE.LinearFilter;
            texture.minFilter = THREE.LinearMipMapLinearFilter;
            texture.generateMipmaps = true;

            console.log('Lightmap texture created, applying to ALL materials');

            self.el.object3D.traverse((node) => {
                if (node.isMesh) {
                    console.log('Applying lightmap to:', node.material && node.material.name);
                    node.material.lightMap = texture;
                    node.material.lightMapIntensity = self.data.intensity;
                    node.material.needsUpdate = true;
                    if (!node.material.defines) node.material.defines = {};
                    node.material.defines.USE_LIGHTMAP = '';
                }
            });
        });
    },
});
