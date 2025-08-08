// api/upload.js (部署到Vercel/Netlify/AWS Lambda等)

module.exports = async (req, res) => { // 注意：module.exports 是一个 async 函数
  // CORS 头部：允许来自您的前端域名或其他来源的请求
  // 生产环境中，建议将 '*' 替换为您的前端域名，例如 'https://yaojiwei520.github.io'
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');

  // 处理 OPTIONS 预检请求 by Vercel/Netlify's default behavior
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // *** 关键修改：取消注释这一行，使用动态导入 ***
    const { Octokit } = await import('@octokit/rest'); // <-- 使用此行
    // const { Octokit } = require('@octokit/rest'); // <-- 务必注释或删除这一行

    // 验证请求
    if (!req.body || !req.body.image || !req.body.type) {
      return res.status(400).json({ error: 'Missing image data or type. Please provide Base64 image and its MIME type.' });
    }

    // 验证 GITHUB_TOKEN 是否存在
    if (!process.env.GITHUB_TOKEN) {
        console.error('GITHUB_TOKEN environment variable is not set.');
        return res.status(500).json({ error: 'Server configuration error: GitHub token missing.' });
    }

    // 初始化GitHub客户端
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

    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substr(2, 6);
    const filename = `images/${timestamp}_${randomSuffix}.${ext}`;
    const path = filename; // 仓库中的完整路径

    // 上传到GitHub
    const uploadResult = await octokit.repos.createOrUpdateFileContents({
      owner: owner,
      repo: repo,
      path: path,
      message: `Upload image: ${filename}`,
      content: imageBase64,
      committer: {
        name: 'GitHub Image Uploader',
        email: 'uploader@example.com'
      },
      author: {
        name: 'GitHub Image Uploader',
        email: 'uploader@example.com'
      }
    });

    // *** 确保这里构建的是 GitHub Blob 链接 ***
    const githubBlobUrl = `https://github.com/${owner}/${repo}/blob/main/${path}`; 

    // 添加调试日志，帮助您在 Vercel 日志中确认后端实际返回了什么
    console.log(`[Backend Debug] Generated GitHub Blob URL: ${githubBlobUrl}`);
    console.log(`[Backend Debug] Sending URL to frontend: ${githubBlobUrl}`);
    
    res.status(200).json({
      url: githubBlobUrl,       // <-- 确保返回的是 githubBlobUrl
      markdown: `![image](${githubBlobUrl})`, // <-- 确保返回的是 githubBlobUrl
      path: path,
      sha: uploadResult.data.content.sha
    });
    
  } catch (error) {
    console.error('Upload failed:', error);
    const errorMessage = error.response?.data?.message || error.message;
    res.status(500).json({ 
      error: 'Upload failed',
      details: errorMessage 
    });
  }
};
