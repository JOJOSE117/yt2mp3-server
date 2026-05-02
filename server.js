const express = require('express');
const { exec, execSync } = require('child_process');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

function setup() {
    // Instalar yt-dlp
    try {
        execSync('python3 -c "import yt_dlp"');
        console.log('yt-dlp OK');
    } catch(e) {
        console.log('Instalando yt-dlp...');
        execSync('python3 -m pip install yt-dlp --quiet --break-system-packages', { timeout: 60000 });
    }

    // Instalar Deno
    try {
        execSync('which deno');
        console.log('Deno ya instalado');
    } catch(e) {
        console.log('Instalando Deno...');
        try {
            execSync('curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh', {
                timeout: 60000,
                shell: '/bin/bash'
            });
            console.log('Deno instalado en /usr/local/bin/deno');
        } catch(e2) {
            console.log('Error instalando Deno:', e2.message);
        }
    }
}

setup();

// Verificar Deno después de instalación
let denoAvailable = false;
try {
    execSync('deno --version');
    denoAvailable = true;
    console.log('Deno disponible');
} catch(e) {
    // Intentar ruta directa
    if (fs.existsSync('/usr/local/bin/deno')) {
        process.env.PATH = `/usr/local/bin:${process.env.PATH}`;
        denoAvailable = true;
        console.log('Deno disponible en /usr/local/bin');
    } else {
        console.log('Deno no disponible, continuando sin él');
    }
}

app.get('/health', (req, res) => {
    try {
        const ytVersion = execSync('python3 -m yt_dlp --version').toString().trim();
        let denoVersion = 'no instalado';
        try { denoVersion = execSync('deno --version').toString().split('\n')[0]; } catch(e) {}
        res.json({ status: 'ok', ytdlp: ytVersion, deno: denoVersion });
    } catch(e) {
        res.json({ status: 'error', message: e.message });
    }
});

app.get('/download', (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).json({ error: 'URL requerida' });

    const isYoutube = videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be');
    if (!isYoutube) return res.status(400).json({ error: 'Solo URLs de YouTube' });

    const outputFile = `/tmp/audio_${Date.now()}.m4a`;

    let cmd = `python3 -m yt_dlp`;
    if (denoAvailable) cmd += ` --js-runtimes deno`;
    cmd += ` --extractor-args "youtube:player_client=web_creator,default"`;
    cmd += ` -x --audio-format m4a --audio-quality 128K --no-playlist`;
    cmd += ` -o "${outputFile}" "${videoUrl}"`;

    console.log(`Ejecutando: ${cmd}`);

    exec(cmd, { timeout: 180000, env: process.env }, (error, stdout, stderr) => {
        if (error) {
            console.error('stderr:', stderr);
            return res.status(500).json({ error: 'Error al procesar', details: stderr });
        }

        if (!fs.existsSync(outputFile)) {
            return res.status(500).json({ error: 'No se generó el archivo' });
        }

        res.setHeader('Content-Type', 'audio/mp4');
        res.setHeader('Content-Disposition', 'attachment; filename="audio.m4a"');

        const stream = fs.createReadStream(outputFile);
        stream.pipe(res);
        stream.on('end', () => { try { fs.unlinkSync(outputFile); } catch(e) {} });
        stream.on('error', () => res.status(500).json({ error: 'Error al enviar' }));
    });
});

app.listen(PORT, () => {
    console.log(`Servidor en puerto ${PORT}`);
});
