const express = require('express');
const { exec, execSync } = require('child_process');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Encontrar dónde está instalado yt-dlp
let ytdlpPath = 'yt-dlp';
try {
    ytdlpPath = execSync('which yt-dlp').toString().trim();
    console.log(`yt-dlp encontrado en: ${ytdlpPath}`);
} catch(e) {
    try {
        ytdlpPath = execSync('which python3').toString().trim()
            .replace('python3', '') + '../bin/yt-dlp';
        console.log(`yt-dlp path alternativo: ${ytdlpPath}`);
    } catch(e2) {
        console.log('yt-dlp no encontrado, usando comando directo');
    }
}

app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        ytdlp: ytdlpPath,
        time: new Date().toISOString() 
    });
});

app.get('/download', (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).json({ error: 'URL requerida' });

    const isYoutube = videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be');
    if (!isYoutube) return res.status(400).json({ error: 'Solo URLs de YouTube' });

    const outputFile = `/tmp/audio_${Date.now()}.m4a`;
    const cmd = `"${ytdlpPath}" -x --audio-format m4a --audio-quality 128K --no-playlist -o "${outputFile}" "${videoUrl}"`;

    console.log(`Ejecutando: ${cmd}`);

    exec(cmd, { timeout: 180000 }, (error, stdout, stderr) => {
        if (error) {
            console.error('Error:', stderr);
            return res.status(500).json({ 
                error: 'Error al procesar', 
                details: stderr,
                cmd: cmd
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
        stream.on('error', () => res.status(500).json({ error: 'Error al enviar archivo' }));
    });
});

app.listen(PORT, () => {
    console.log(`Servidor en puerto ${PORT}`);
    console.log(`yt-dlp path: ${ytdlpPath}`);
});
