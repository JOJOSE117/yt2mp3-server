const express = require('express');
const { exec, execSync } = require('child_process');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Instalar yt-dlp en runtime si no está disponible
function ensureYtDlp() {
    try {
        execSync('python3 -c "import yt_dlp"', { env: process.env });
        console.log('yt-dlp ya está disponible');
        return true;
    } catch(e) {
        console.log('Instalando yt-dlp en runtime...');
        try {
            execSync('python3 -m pip install yt-dlp --quiet --break-system-packages', {
                timeout: 60000,
                env: process.env
            });
            console.log('yt-dlp instalado exitosamente');
            return true;
        } catch(e2) {
            console.error('Error instalando yt-dlp:', e2.message);
            return false;
        }
    }
}

ensureYtDlp();

app.get('/health', (req, res) => {
    try {
        const version = execSync('python3 -m yt_dlp --version').toString().trim();
        res.json({ status: 'ok', ytdlp_version: version });
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
    const cmd = `python3 -m yt_dlp -x --audio-format m4a --audio-quality 128K --no-playlist -o "${outputFile}" "${videoUrl}"`;

    console.log(`Ejecutando: ${cmd}`);

    exec(cmd, { timeout: 180000, env: process.env }, (error, stdout, stderr) => {
        if (error) {
            console.error('Error:', stderr);
            // Intentar reinstalar y reintentar una vez
            try {
                execSync('python3 -m pip install yt-dlp --upgrade --quiet --break-system-packages');
            } catch(e) {}
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
