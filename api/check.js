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
    // Utamakan stream HD asli
    const playUrl = v.hdplay || v.play;
    const duration = v.duration || 0;
    const sizeBytes = v.size || 0;
    const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
    
    let bitrateKbps = "--";
    if (duration > 0 && sizeBytes > 0) {
      bitrateKbps = Math.round((sizeBytes * 8) / duration / 1000);
    }

    // Default cadangan
    let detectedCodec = "H.264 / AVC (avc1)";
    let detectedFps = "60.00 FPS";
    let isHDR = "Tidak";
    let realWidth = v.width || 720;
    let realHeight = v.height || 1280;

    try {
      // Ambil 3 MB pertama untuk membaca header moov, tkhd, mdhd
      const rangeRes = await fetch(playUrl, {
        headers: { 'Range': 'bytes=0-3145728' }
      });
      const arrayBuffer = await rangeRes.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const bufStr = buffer.toString('binary');

      // 1. Ekstrak Codec
      if (bufStr.includes('bytevc1')) {
        detectedCodec = 'ByteVC1 (TikTok Smart Codec)';
      } else if (bufStr.includes('hvc1') || bufStr.includes('hev1')) {
        detectedCodec = 'H.265 / HEVC';
      } else if (bufStr.includes('avc1')) {
        detectedCodec = 'H.264 / AVC (avc1)';
      }

      // 2. Ekstrak HDR
      if (bufStr.includes('colr') && (bufStr.includes('bt2020') || bufStr.includes('smpte2084') || bufStr.includes('arib-std-b67'))) {
        isHDR = "Ya (HDR)";
      }

      // 3. Ekstrak True FPS
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

      // 4. Ekstrak True Resolution dari Track Header (tkhd)
      const tkhdIndex = buffer.indexOf(Buffer.from('tkhd'));
      if (tkhdIndex !== -1) {
        // Ambil width dan height fixed-point 16.16 dari 8 byte terakhir box tkhd (84 byte panjang box)
        const tkhdLength = buffer.readUInt32BE(tkhdIndex - 4);
        if (tkhdLength >= 84) {
          const w = buffer.readUInt16BE(tkhdIndex - 4 + tkhdLength - 8);
          const h = buffer.readUInt16BE(tkhdIndex - 4 + tkhdLength - 4);
          if (w > 0 && h > 0) {
            realWidth = w;
            realHeight = h;
          }
        }
      }
    } catch (e) {
      // Jika Range gagal, gunakan dimensi fallback
    }

    // Labeling Kualitas Otomatis (1080p, 720p, 2K, 4K)
    const minDim = Math.min(realWidth, realHeight);
    let resLabel = `${realWidth} x ${realHeight}`;
    if (minDim >= 1080) {
      resLabel = `${realWidth} x ${realHeight} (1080p Full HD)`;
    } else if (minDim >= 720) {
      resLabel = `${realWidth} x ${realHeight} (720p HD)`;
    } else {
      resLabel = `${realWidth} x ${realHeight} (540p SD)`;
    }

    // Metrik Sosial
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
        resolution: resLabel,
        fps: detectedFps,
        video_codec: detectedCodec,
        hdr: isHDR,
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
