const fs = require('fs');
const path = require('path');

/**
 * THE FRACTAL KERNEL
 *
 * A manifest-driven feature discovery engine for Node.js + Express.
 *
 * How it works:
 *   1. Scans the features/ directory recursively
 *   2. Any folder with a feature.manifest.json is treated as a Feature
 *   3. The Feature's routes are auto-mounted on Express
 *   4. Recursion stops at a Feature â€” it owns its own sub-directories
 *
 * You never modify this file. You only add/remove feature folders.
 */
class Kernel {
    constructor() {
        this.features = new Map(); // id â†’ feature object
        this.app = null;
        this.loaded = false;
    }

    /**
     * Boot the kernel: discover all features, then mount them.
     * @param {Object} app - Express app instance
     * @param {String} featuresDir - Relative path to features dir (default: ./features)
     */
    async boot(app, featuresDir = './features') {
        console.log('ðŸš€ [Kernel] Booting...');
        this.app = app;

        const absFeaturesDir = path.resolve(__dirname, featuresDir);

        if (!fs.existsSync(absFeaturesDir)) {
            console.error(`âŒ [Kernel] Features directory not found: ${absFeaturesDir}`);
            return;
        }

        // Phase 1 â€” Discovery (recursive)
        this.discoverFeatures(absFeaturesDir);
        console.log(`ðŸ” [Kernel] Discovered ${this.features.size} feature(s).`);

        // Phase 2 â€” Mount
        for (const [id] of this.features) {
            await this.mountFeature(id);
        }

        this.loaded = true;
        console.log(`âœ… [Kernel] Ready. ${this.features.size} feature(s) active.\n`);
    }

    /**
     * Recursively walk directories looking for feature.manifest.json.
     * Stops recursion when a manifest is found (that feature owns its children).
     */
    discoverFeatures(currentPath) {
        if (!fs.existsSync(currentPath)) return;

        const manifestPath = path.join(currentPath, 'feature.manifest.json');

        // If this folder has a manifest, it IS a feature â€” register and stop recursion
        if (fs.existsSync(manifestPath)) {
            try {
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

                if (!manifest.id || !manifest.basePath) {
                    console.warn(`âš ï¸  [Kernel] Skipping manifest at ${currentPath}: missing id or basePath`);
                    return;
                }

                if (manifest.enabled === false) {
                    console.log(`â­ï¸  [Kernel] Skipping disabled feature: ${manifest.id}`);
                    return;
                }

                this.features.set(manifest.id, {
                    ...manifest,
                    dirPath: currentPath,
                    loaded: false
                });
            } catch (e) {
                console.error(`âŒ [Kernel] Could not parse manifest at ${currentPath}: ${e.message}`);
            }
            return; // Stop â€” this feature owns its own children
        }

        const IGNORE = ['node_modules', '.git', '_example', '_template', 'temp', '.DS_Store'];
        let entries;

        try {
            entries = fs.readdirSync(currentPath, { withFileTypes: true });
        } catch (e) {
            console.error(`âŒ [Kernel] Cannot read directory ${currentPath}: ${e.message}`);
            return;
        }

        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            if (IGNORE.includes(entry.name)) continue;
            this.discoverFeatures(path.join(currentPath, entry.name));
        }
    }

    /**
     * Mount a single feature's routes and optional boot script onto Express.
     */
    async mountFeature(featureId) {
        const feature = this.features.get(featureId);

        try {
            // Mount primary route file
            if (feature.routes) {
                const routePath = path.join(feature.dirPath, feature.routes);
                if (fs.existsSync(routePath)) {
                    const router = require(routePath);
                    this.app.use(feature.basePath, router);
                    console.log(`  ðŸ”Œ ${feature.name} â†’ ${feature.basePath}`);
                } else {
                    console.warn(`  âš ï¸  Routes file not found for ${featureId}: ${routePath}`);
                }
            }

            // Mount additional routes if declared (e.g. webhooks, callbacks)
            if (Array.isArray(feature.additionalRoutes)) {
                for (const routeDef of feature.additionalRoutes) {
                    if (routeDef.path && routeDef.file) {
                        const routePath = path.join(feature.dirPath, routeDef.file);
                        if (fs.existsSync(routePath)) {
                            const router = require(routePath);
                            this.app.use(routeDef.path, router);
                            console.log(`     + ${routeDef.path}`);
                        }
                    }
                }
            }

            // Run optional boot script (for cron jobs, event listeners, etc.)
            if (feature.boot) {
                const bootPath = path.join(feature.dirPath, feature.boot);
                if (fs.existsSync(bootPath)) {
                    const bootFn = require(bootPath);
                    if (typeof bootFn === 'function') await bootFn(this.app, this);
                    else if (typeof bootFn.init === 'function') await bootFn.init(this.app, this);
                }
            }

            feature.loaded = true;

        } catch (error) {
            console.error(`  âŒ Failed to mount ${featureId}: ${error.message}`);
        }
    }

    /** Returns all discovered features as an array */
    getAllFeatures() {
        return Array.from(this.features.values());
    }

    /** Returns a single feature by id */
    getFeature(id) {
        return this.features.get(id);
    }
}

// Export as singleton â€” one Kernel per process
module.exports = new Kernel();
