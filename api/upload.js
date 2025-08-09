// api/upload.js (部署到Vercel/Netlify/AWS Lambda等)

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // 确保这里使用动态导入 Octokit 以解决 ERR_REQUIRE_ESM 错误
    const { Octokit } = await import('@octokit/rest'); 
    // const { Octokit } = require('@octokit/rest'); // <-- 务必注释或删除这一行

    if (!req.body || !req.body.image || !req.body.type) {
      return res.status(400).json({ error: 'Missing image data or type. Please provide Base64 image and its MIME type.' });
    }
    if (!process.env.GITHUB_TOKEN) {
        console.error('GITHUB_TOKEN environment variable is not set.');
        return res.status(500).json({ error: 'Server configuration error: GitHub token missing.' });
    }

    const octokit = new Octokit({ 
      auth: process.env.GITHUB_TOKEN,
      userAgent: 'GitHub-Image-Uploader/1.0',
      baseUrl: 'https://api.github.com'
    });

    const owner = 'yaojiwei520'; // <-- 替换为您的GitHub用户名
    const repo = 'yaojiwei520.github.io'; // <-- 替换为您的GitHub仓库名

    const imageBase64 = req.body.image;
    const mimeType = req.body.type;

    let ext = mimeType.split('/')[1] || 'png';
    if (ext === 'jpeg') ext = 'jpg';

    // *** 核心修改：生成北京时间命名 ***
    const now = new Date();
    const timeOptions = { 
        timeZone: 'Asia/Shanghai', // 指定北京时间
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit', 
        hour12: false // 24小时制
    };

    // 使用 Intl.DateTimeFormat 获取格式化后的时间各部分
    const year = new Intl.DateTimeFormat('en-US', { ...timeOptions, year: 'numeric' }).format(now);
    const month = new Intl.DateTimeFormat('en-US', { ...timeOptions, month: '2-digit' }).format(now);
    const day = new Intl.DateTimeFormat('en-US', { ...timeOptions, day: '2-digit' }).format(now);
    const hours = new Intl.DateTimeFormat('en-US', { ...timeOptions, hour: '2-digit' }).format(now);
    const minutes = new Intl.DateTimeFormat('en-US', { ...timeOptions, minute: '2-digit' }).format(now);
    const seconds = new Intl.DateTimeFormat('en-US', { ...timeOptions, second: '2-digit' }).format(now);
    
    // 拼接成 YYYYMMDDHHmmss 格式，并加上一个短的随机后缀以防万一
    const datetimeString = `${year}${month}${day}${hours}${minutes}${seconds}`;
    const randomSuffix = Math.random().toString(36).substr(2, 4); // 更短的随机后缀
    const filename = `${datetimeString}_${randomSuffix}.${ext}`;
    
    const path = `images/${filename}`; // 仓库中的完整路径

    // 上传到GitHub
    const uploadResult = await octokit.repos.createOrUpdateFileContents({
      owner: owner,
      repo: repo,
      path: path, 
      message: `Upload image: ${filename}`,
      content: imageBase64,
      committer: { name: 'GitHub Image Uploader', email: 'uploader@example.com' },
      author: { name: 'GitHub Image Uploader', email: 'uploader@example.com' }
    });

    // 同时构建 GitHub Blob 链接 和 GitHub Pages CDN 链接
    const githubBlobUrl = `https://github.com/${owner}/${repo}/blob/main/${path}`; 
    const githubPagesCdnUrl = `https://${owner}.github.io/${path}`; 

    console.log(`[Backend Debug] Generated Filename (Beijing Time): ${filename}`);
    console.log(`[Backend Debug] GitHub Blob URL: ${githubBlobUrl}`);
    console.log(`[Backend Debug] GitHub Pages CDN URL: ${githubPagesCdnUrl}`);
    
    res.status(200).json({
      blobUrl: githubBlobUrl,       // 返回 Blob URL
      cdnUrl: githubPagesCdnUrl,    // 返回 CDN URL
      path: path,                   
      sha: uploadResult.data.content.sha // 或者根据需要，如果您没有需要可以设为null
    });
    
  } catch (error) {
    console.error('Upload failed:', error);
    const errorMessage = error.response?.data?.message || error.message;
    res.status(500).json({ error: 'Upload failed', details: errorMessage });
  }
};
