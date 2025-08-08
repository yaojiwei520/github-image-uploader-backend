// api/upload.js (部署到Vercel/Netlify/AWS Lambda等)
// 注意：这里将 require 替换为动态 import
// const { Octokit } = require('@octokit/rest'); // <-- 移除或注释这行

module.exports = async (req, res) => {
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
    // 动态导入 Octokit。因为 module.exports 是一个 async 函数，所以这里可以使用 await
    const { Octokit } = await import('@octokit/rest');

    // 验证请求
    if (!req.body || !req.body.image || !req.body.type) {
      return res.status(400).json({ error: 'Missing image data or type. Please provide Base64 image and its MIME type.' });
    }

    // 验证 GITHUB_TOKEN 是否存在
    if (!process.env.GITHUB_TOKEN) {
        console.error('GITHUB_TOKEN environment variable is not set.');
        // 在生产环境中不暴露内部错误信息
        return res.status(500).json({ error: 'Server configuration error. Please contact administrator.' });
    }

    // 初始化GitHub客户端
    const octokit = new Octokit({ 
      auth: process.env.GITHUB_TOKEN, // 确保这个Token有repo/contents:write权限
      userAgent: 'GitHub-Image-Uploader/1.0',
      baseUrl: 'https://api.github.com' // 明确指定GitHub API基地址
    });

    const owner = 'yaojiwei520'; // <-- **替换为您的GitHub用户名**
    const repo = 'yaojiwei520.github.io'; // <-- **替换为您的GitHub用户名**
    const imageBase64 = req.body.image; // 前端已经去掉了 'data:image/jpeg;base64,' 前缀
    const mimeType = req.body.type; // 例如 'image/jpeg'

    // 从MIME类型获取文件扩展名 (例如 'image/jpeg' -> 'jpeg')
    let ext = mimeType.split('/')[1] || 'png';
    if (ext === 'jpeg') ext = 'jpg'; // 统一使用 .jpg

    // 生成唯一文件名
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
      content: imageBase64, // 传入纯Base64编码的字符串
      committer: {
        name: 'GitHub Image Uploader',
        email: 'uploader@example.com' // 可以是任何有效邮箱
      },
      author: {
        name: 'GitHub Image Uploader',
        email: 'uploader@example.com'
      }
    });

    // 构建CDN链接
    const cdnUrl = `https://${owner}.github.io/${path}`;
    
    res.status(200).json({
      url: cdnUrl,
      markdown: `![image](${cdnUrl})`,
      path: path, // 返回完整路径
      sha: uploadResult.data.content.sha // 返回新文件的SHA值
    });
    
  } catch (error) {
    console.error('Upload failed:', error);
    // 尝试解析GitHub API的错误响应
    const errorMessage = error.response?.data?.message || error.message;
    res.status(500).json({ 
      error: 'Upload failed',
      details: errorMessage 
    });
  }
};
