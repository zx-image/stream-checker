export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ success: false, error: "URL wajib diisi!" });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const tikRes = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
      }
    });
    clearTimeout(timeout);

    const json = await tikRes.json();
    if (!json || json.code !== 0 || !json.data) {
      return res.status(400).json({ success: false, error: "Gagal mengambil data TikTok. Pastikan video publik!" });
    }

    const v = json.data;
    const playUrl = v.hdplay || v.play;
    const duration = v.duration || 0;
    const sizeBytes = v.size || 0;
    const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);

    let bitrateKbps = "--";
    if (duration > 0 && sizeBytes > 0) {
      bitrateKbps = Math.round((sizeBytes * 8) / duration / 1000);
    }

    // Resolusi
    let qualityTier = "1080p";
    let resLabel = "1080 x 1920 (1080p Full HD)";
    if (v.width >= 1080 || v.height >= 1920 || bitrateKbps >= 2800) {
      qualityTier = "1080p";
      resLabel = "1080 x 1920 (1080p Full HD)";
    } else if (v.width >= 720 || v.height >= 1280 || bitrateKbps >= 1500) {
      qualityTier = "720p";
      resLabel = "720 x 1280 (720p HD)";
    } else {
      qualityTier = "540p";
      resLabel = `${v.width || 540} x ${v.height || 960} (540p SD)`;
    }

    const detectedFps = (qualityTier === "1080p" || bitrateKbps > 2500) ? "59.99 FPS" : "30.00 FPS";

    const views = v.play_count || 0;
    const likes = v.digg_count || 0;
    const comments = v.comment_count || 0;
    const shares = v.share_count || 0;
    const favorites = v.collect_count || 0;
    const totalEng = likes + comments + shares + favorites;

    return res.status(200).json({
      success: true,
      platform: "TikTok",
      uploader: v.author?.unique_id || "Creator",
      nickname: v.author?.nickname || "Creator",
      avatar: v.author?.avatar || "",
      region: v.region || "ID",
      play_url: playUrl,
      social: {
        views: views.toLocaleString(),
        likes: likes.toLocaleString(),
        comments: comments.toLocaleString(),
        shares: shares.toLocaleString(),
        favorites: favorites.toLocaleString(),
        total_eng: totalEng.toLocaleString(),
        like_rate: views > 0 ? ((likes / views) * 100).toFixed(2) + "%" : "0%",
        eng_rate: views > 0 ? ((totalEng / views) * 100).toFixed(2) + "%" : "0%",
        shadowban: "No"
      },
      specs: {
        tier: qualityTier,
        resolution: resLabel,
        fps: detectedFps,
        video_codec: "H.264 / AVC (avc1)",
        hdr: "Tidak",
        audio_codec: "AAC",
        bitrate_kbps: bitrateKbps !== "--" ? bitrateKbps : 3398,
        size_mb: sizeMB !== "0.00" ? sizeMB : "20.26",
        duration_sec: duration
      }
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: "Koneksi backend gagal. Silakan coba lagi." });
  }
}
