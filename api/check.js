export default async function handler(req, res) {
  // Set header CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ success: false, error: 'URL video wajib diisi!' });
  }

  try {
    // 1. Ambil data stream asli dari TikWM API
    const tikRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`);
    const tikData = await tikRes.json();

    if (!tikData || tikData.code !== 0 || !tikData.data) {
      return res.status(400).json({ success: false, error: 'Gagal mengambil metadata TikTok. Pastikan video publik!' });
    }

    const v = tikData.data;
    const playUrl = v.hdplay || v.play;
    const duration = v.duration || 0;
    const sizeBytes = v.size || 0;
    const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
    
    let bitrateKbps = "--";
    if (duration > 0 && sizeBytes > 0) {
      bitrateKbps = Math.round((sizeBytes * 8) / duration / 1000);
    }

    // 2. Ambil 2MB potongan header video untuk bedah Codec & FPS murni
    let detectedCodec = "H.264 / AVC";
    let detectedFps = "60 FPS";

    try {
      const rangeRes = await fetch(playUrl, {
        headers: { 'Range': 'bytes=0-2097152' }
      });
      const arrayBuffer = await rangeRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const bufStr = buffer.toString('binary');

      // Deteksi Codec dari jeroan container
      if (bufStr.includes('bytevc1')) {
        detectedCodec = 'ByteVC1 (TikTok Smart Codec)';
      } else if (bufStr.includes('hvc1') || bufStr.includes('hev1')) {
        detectedCodec = 'H.265 / HEVC';
      } else if (bufStr.includes('avc1')) {
        detectedCodec = 'H.264 / AVC (avc1)';
      }

      // Deteksi Frame Rate dari timescale Media Header
      const mdhdIndex = buffer.indexOf(Buffer.from('mdhd'));
      const sttsIndex = buffer.indexOf(Buffer.from('stts'));

      if (mdhdIndex !== -1 && sttsIndex !== -1) {
        const version = buffer.readUInt8(mdhdIndex + 4);
        const timeScale = version === 0 ? buffer.readUInt32BE(mdhdIndex + 16) : buffer.readUInt32BE(mdhdIndex + 24);
        const sampleDelta = buffer.readUInt32BE(sttsIndex + 16);

        if (timeScale > 0 && sampleDelta > 0) {
          const rawFps = timeScale / sampleDelta;
          if (rawFps >= 20 && rawFps <= 144) {
            detectedFps = `${Math.round(rawFps)} FPS`;
          }
        }
      }
    } catch (e) {
      // Jika Range dibatasi, fallback ke estimasi stabil
      detectedFps = (v.width >= 1080 || bitrateKbps > 8000) ? "60 FPS" : "30 FPS";
    }

    return res.status(200).json({
      success: true,
      platform: "TikTok",
      title: v.title || "TikTok Video",
      uploader: v.author ? v.author.unique_id : "Creator",
      play_url: playUrl,
      specs: {
        resolution: `${v.width || 720} x ${v.height || 1280}`,
        fps: detectedFps,
        video_codec: detectedCodec,
        audio_codec: "AAC",
        bitrate_kbps: bitrateKbps,
        size_mb: sizeMB,
        duration_sec: duration
      }
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
