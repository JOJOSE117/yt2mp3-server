const express = require('express');
const { exec, execSync } = require('child_process');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

function ensureYtDlp() {
    try {
        execSync('python3 -c "import yt_dlp"');
        console.log('yt-dlp disponible');
    } catch(e) {
        console.log('Instalando yt-dlp...');
        execSync('python3 -m pip install yt-dlp --quiet --break-system-packages', {
            timeout: 60000
        });
    }
}

function getDenoPath() {
    try {
        const p = execSync('which deno').toString().trim();
        console.log(`Deno encontrado: ${p}`);
        return p;
    } catch(e) {
        console.log('Deno no encontrado');
        return null;
    }
}

ensureYtDlp();
const denoPath = getDenoPath();

app.get('/health', (req, res) => {
    try {
        const version = execSync('python3 -m yt_dlp --version').toString().trim();
        res.json({ 
            status: 'ok', 
            ytdlp_version: version,
            deno: denoPath || 'no encontrado'
        });
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
    
    // Construir comando con Deno si está disponible
    let cmd = `python3 -m yt_dlp`;
    if (denoPath) {
        cmd += ` --js-runtimes deno`;
    }
    cmd += ` -x --audio-format m4a --audio-quality 128K --no-playlist`;
    cmd += ` -o "${outputFile}" "${videoUrl}"`;

    // Configurar entorno con Deno en PATH
    const env = { ...process.env };
    if (denoPath) {
        const denoDir = denoPath.substring(0, denoPath.lastIndexOf('/'));
        env.PATH = `${denoDir}:${process.env.PATH}`;
        env.DENO_PATH = denoPath;
    }

    console.log(`Ejecutando: ${cmd}`);

    exec(cmd, { timeout: 180000, env }, (error, stdout, stderr) => {
        if (error) {
            console.error('stdout:', stdout);
            console.error('stderr:', stderr);
            return res.status(500).json({ 
                error: 'Error al procesar', 
                details: stderr
            });
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
