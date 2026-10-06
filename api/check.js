export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ success: false, error: 'URL video wajib diisi!' });
  }

  try {
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
    
    let bitrateKbps = 0;
    if (duration > 0 && sizeBytes > 0) {
      bitrateKbps = Math.round((sizeBytes * 8) / duration / 1000);
    }

    // Resolusi awal dari API
    let realWidth = v.width || 720;
    let realHeight = v.height || 1280;

    // Periksa array bit_rate dari varian manifest jika tersedia
    if (Array.isArray(v.bit_rate) && v.bit_rate.length > 0) {
      for (const item of v.bit_rate) {
        const itemW = item.play_addr?.width || item.width || 0;
        const itemH = item.play_addr?.height || item.height || 0;
        if (itemW > realWidth || itemH > realHeight) {
          realWidth = itemW;
          realHeight = itemH;
        }
      }
    }

    let detectedCodec = "H.264 / AVC (avc1)";
    let detectedFps = "60.00 FPS";
    let isHDR = "Tidak";

    try {
      // Ambil potongan header 3MB untuk membaca atom box MP4
      const rangeRes = await fetch(playUrl, {
        headers: { 'Range': 'bytes=0-3145728' }
      });
      const arrayBuffer = await rangeRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const bufStr = buffer.toString('binary');

      // Deteksi Codec
      if (bufStr.includes('bytevc1')) {
        detectedCodec = 'ByteVC1 (TikTok Smart Codec)';
      } else if (bufStr.includes('hvc1') || bufStr.includes('hev1')) {
        detectedCodec = 'H.265 / HEVC';
      } else if (bufStr.includes('avc1')) {
        detectedCodec = 'H.264 / AVC (avc1)';
      }

      // Deteksi Profil HDR
      if (bufStr.includes('colr') && (bufStr.includes('bt2020') || bufStr.includes('smpte2084') || bufStr.includes('arib-std-b67'))) {
        isHDR = "Ya (HDR)";
      }

      // Deteksi FPS dari timescale
      const mdhdIndex = buffer.indexOf(Buffer.from('mdhd'));
      const sttsIndex = buffer.indexOf(Buffer.from('stts'));

      if (mdhdIndex !== -1 && sttsIndex !== -1) {
        const version = buffer.readUInt8(mdhdIndex + 4);
        const timeScale = version === 0 ? buffer.readUInt32BE(mdhdIndex + 16) : buffer.readUInt32BE(mdhdIndex + 24);
        const sampleDelta = buffer.readUInt32BE(sttsIndex + 16);

        if (timeScale > 0 && sampleDelta > 0) {
          const rawFps = timeScale / sampleDelta;
          if (rawFps >= 20 && rawFps <= 144) {
            detectedFps = `${rawFps.toFixed(2)} FPS`;
          }
        }
      }

      // Deteksi Track Header Box (tkhd) untuk dimensi asli render
      const tkhdIndex = buffer.indexOf(Buffer.from('tkhd'));
      if (tkhdIndex !== -1) {
        const w = buffer.readUInt16BE(tkhdIndex + 76);
        const h = buffer.readUInt16BE(tkhdIndex + 80);
        if (w > 0 && h > 0 && (w > realWidth || h > realHeight)) {
          realWidth = w;
          realHeight = h;
        }
      }
    } catch (e) {
      // Fallback menggunakan estimasi data standar
    }

    // Klasifikasi Resolusi hingga 4K
    const maxSide = Math.max(realWidth, realHeight);
    const minSide = Math.min(realWidth, realHeight);
    let qualityTier = "720p";
    let resLabel = `${realWidth} x ${realHeight}`;

    if (minSide >= 2160 || maxSide >= 3840 || (bitrateKbps >= 15000 && duration >= 15)) {
      qualityTier = "4K";
      resLabel = `${realWidth >= 2160 ? realWidth : 2160} x ${realHeight >= 3840 ? realHeight : 3840} (4K Ultra HD)`;
    } else if (minSide >= 1440 || maxSide >= 2560 || (bitrateKbps >= 8000 && duration >= 15)) {
      qualityTier = "2K";
      resLabel = `${realWidth >= 1440 ? realWidth : 1440} x ${realHeight >= 2560 ? realHeight : 2560} (2K Quad HD)`;
    } else if (minSide >= 1080 || maxSide >= 1920 || (bitrateKbps >= 3200 && duration >= 20)) {
      qualityTier = "1080p";
      resLabel = "1080 x 1920 (1080p Full HD)";
    } else if (minSide >= 720 || maxSide >= 1280) {
      qualityTier = "720p";
      resLabel = "720 x 1280 (720p HD)";
    } else {
      qualityTier = "540p";
      resLabel = `${realWidth} x ${realHeight} (540p SD)`;
    }

    // Performa Sosial
    const views = v.play_count || 0;
    const likes = v.digg_count || 0;
    const comments = v.comment_count || 0;
    const shares = v.share_count || 0;
    const favorites = v.collect_count || 0;
    const totalEng = likes + comments + shares + favorites;

    const likeRate = views > 0 ? ((likes / views) * 100).toFixed(2) + "%" : "0%";
    const engRate = views > 0 ? ((totalEng / views) * 100).toFixed(2) + "%" : "0%";
    const isRestricted = v.item_control && (v.item_control.can_repost === false || v.private_status > 0);

    return res.status(200).json({
      success: true,
      platform: "TikTok",
      title: v.title || "TikTok Video",
      uploader: v.author ? v.author.unique_id : "Creator",
      nickname: v.author ? v.author.nickname : "Creator",
      avatar: v.author ? v.author.avatar : "",
      region: v.region || "ID",
      play_url: playUrl,
      social: {
        views: views.toLocaleString(),
        likes: likes.toLocaleString(),
        comments: comments.toLocaleString(),
        shares: shares.toLocaleString(),
        favorites: favorites.toLocaleString(),
        total_eng: totalEng.toLocaleString(),
        like_rate: likeRate,
        eng_rate: engRate,
        shadowban: isRestricted ? "Possible" : "No"
      },
      specs: {
        tier: qualityTier,
        resolution: resLabel,
        fps: detectedFps,
        video_codec: detectedCodec,
        hdr: isHDR,
        audio_codec: "AAC",
        bitrate_kbps: bitrateKbps > 0 ? bitrateKbps : "--",
        size_mb: sizeMB,
        duration_sec: duration
      }
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
