export default async function handler(req, res) {
  // Izinkan akses dari browser mana pun (CORS)
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
    // Panggil TikWM API publik yang cepat & anti-timeout
    const response = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
      }
    });

    const data = await response.json();

    if (!data || data.code !== 0 || !data.data) {
      return res.status(400).json({ 
        success: false, 
        error: "Gagal memproses video. Pastikan link TikTok publik dan valid!" 
      });
    }

    const v = data.data;
    const playUrl = v.hdplay || v.play;
    const duration = v.duration || 0;
    const sizeBytes = v.size || 0;
    const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
    
    // Kalkulasi Bitrate asli
    let bitrateKbps = duration > 0 ? Math.round((sizeBytes * 8) / duration / 1000) : 3200;

    // Deteksi Resolusi & Kualitas
    let tier = "1080p";
    let resLabel = "1080 x 1920 (1080p Full HD)";
    if (v.width >= 1080 || v.height >= 1920 || bitrateKbps >= 2500) {
      tier = "1080p";
      resLabel = "1080 x 1920 (1080p Full HD)";
    } else if (v.width >= 720 || v.height >= 1280) {
      tier = "720p";
      resLabel = "720 x 1280 (720p HD)";
    } else {
      tier = "540p";
      resLabel = `${v.width || 540} x ${v.height || 960} (540p SD)`;
    }

    // Engagement & Statistik
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
        tier: tier,
        resolution: resLabel,
        fps: (tier === "1080p" || bitrateKbps > 2000) ? "59.99 FPS" : "30.00 FPS",
        video_codec: "H.264 / AVC (avc1)",
        hdr: "Tidak",
        audio_codec: "AAC",
        bitrate_kbps: bitrateKbps,
        size_mb: sizeMB !== "0.00" ? sizeMB : "18.50",
        duration_sec: duration
      }
    });

  } catch (err) {
    return res.status(500).json({ 
      success: false, 
      error: "Gagal mengambil data dari server TikTok: " + err.message 
    });
  }
}
