// api/upload.js (部署到Vercel/Netlify/AWS Lambda等)

module.exports = async (req, res) => {
  // CORS 头部：允许来自您的前端域名或其他来源的请求
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // 确保这里使用动态导入 Octokit 以解决 ERR_REQUIRE_ESM 错误。
    // 这应该已经解决了您过去的那个 Octokit 报错。
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

    // *** 核心修改：使用 formatToParts() 精确获取北京时间各部分 ***
    const now = new Date(); 
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Shanghai', // 指定北京时间
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit', // 这里是 'hour'
        minute: '2-digit',
        second: '2-digit',
        hour12: false // 确保24小时制
    });

    const parts = formatter.formatToParts(now);
    
    // 从 parts 数组中精确提取每个组件的值
    // 确保每个部分都找到，以防止 undefined
    const year = parts.find(p => p.type === 'year')?.value || 'YYYY';
    const month = parts.find(p => p.type === 'month')?.value || 'MM';
    const day = parts.find(p => p.type === 'day')?.value || 'DD';
    const hour = parts.find(p => p.type === 'hour')?.value || 'HH';
    const minute = parts.find(p => p.type === 'minute')?.value || 'mm';
    const second = parts.find(p => p.type === 'second')?.value || 'ss';

    // 拼接成 YYYYMMDDHHmmss 格式
    const datetimeString = `${year}${month}${day}${hour}${minute}${second}`;
    
    // 加上一个短的随机后缀以防止极端情况下的文件名冲突
    const randomSuffix = Math.random().toString(36).substr(2, 4); 
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
      blobUrl: githubBlobUrl,       
      cdnUrl: githubPagesCdnUrl,    
      path: path,                   
      sha: uploadResult.data.content.sha 
    });
    
  } catch (error) {
    console.error('Upload failed:', error);
    const errorMessage = error.response?.data?.message || error.message;
    res.status(500).json({ error: 'Upload failed', details: errorMessage });
  }
};
