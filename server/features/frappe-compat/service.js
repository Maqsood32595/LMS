function getPwaManifest() {
    return {
        name: 'Fractal LMS',
        short_name: 'Fractal LMS',
        description: 'Learn anything — powered by the Fractal Kernel.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#2490EF',
        icons: [
            { src: '/favicon.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/learning.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
    };
}

module.exports = { getPwaManifest };
