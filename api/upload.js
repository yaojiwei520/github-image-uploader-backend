// api/upload.js (部署到Vercel/Netlify/AWS Lambda等)

module.exports = async (req, res) => {
  // CORS 头部：允许来自您的前端域名或其他来源的请求
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');

  // 处理 OPTIONS 预检请求 by Vercel/Netlify's default behavior
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { Octokit } = await import('@octokit/rest'); // 保持动态导入

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

    // *** 核心修改：根据日期和时间生成文件名 ***
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0'); // 月份从0开始，所以+1，并补零
    const day = now.getDate().toString().padStart(2, '0'); // 补零
    const hours = now.getHours().toString().padStart(2, '0'); // 补零
    const minutes = now.getMinutes().toString().padStart(2, '0'); // 补零
    const seconds = now.getSeconds().toString().padStart(2, '0'); // 补零

    // 格式化为 YYYYMMDDHHmmss_random.ext 格式，加上一个短的随机后缀以防止极端情况下的文件名冲突
    const randomSuffix = Math.random().toString(36).substr(2, 4); // 一个更短的随机后缀
    const filename = `${year}${month}${day}${hours}${minutes}${seconds}_${randomSuffix}.${ext}`;
    
    const path = `images/${filename}`; // 仓库中的完整路径

    // 上传到GitHub
    const uploadResult = await octokit.repos.createOrUpdateFileContents({
      owner: owner,
      repo: repo,
      path: path, // 上传到GitHub时使用日期时间生成的文件名
      message: `Upload image: ${filename}`, // Commit message 也使用日期时间文件名
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

    // 同时构建 GitHub Blob 链接 和 GitHub Pages CDN 链接
    const githubBlobUrl = `https://github.com/${owner}/${repo}/blob/main/${path}`; 
    const githubPagesCdnUrl = `https://${owner}.github.io/${path}`; 

    console.log(`[Backend Debug] Generated Filename: ${filename}`);
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
    res.status(500).json({ 
      error: 'Upload failed',
      details: errorMessage 
    });
  }
};
