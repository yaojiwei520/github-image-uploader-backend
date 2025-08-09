// api/v1.mjs (Serverless API Endpoint for multipart/form-data)
// 这是一个 ES Module 文件

import { Octokit } from '@octokit/rest'; 
import fs from 'fs/promises'; 
import { createRequire } from 'module'; // 导入 Node.js 内置的 createRequire 函数

// *** 核心修改：使用 createRequire 导入 formidable 并尝试获取其主函数 ***
const require = createRequire(import.meta.url); 
const formidableModule = require('formidable');
const formidable = formidableModule.default || formidableModule; // <-- 最终尝试这种导入方式


// 配置 formidable
const form = formidable({ // formidable现在应该作为一个函数被正确引用
    multiples: false, 
    keepExtensions: true, 
    maxFileSize: 5 * 1024 * 1024, 
});

// 定义代理前缀
const PROXY_PREFIX = 'https://gh.catmak.name/'; 

// Vercel Serverless Function 的入口点
export default async function handler(req, res) {
  // CORS 头部
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With, Accept');

  // 处理 OPTIONS 预检请求
  if (req.method === 'OPTIONS') {
    console.log("[API DEBUG] Received OPTIONS request.");
    return res.status(200).end();
  }

  // 必须处理 POST 请求
  if (req.method !== 'POST') {
    console.warn(`[API DEBUG] Received ${req.method} request, but only POST is allowed.`);
    return res.status(405).json({ success: false, message: 'Method Not Allowed. Only POST is supported.' });
  }

  console.log("[API DEBUG] Starting POST request processing.");

  try {
    // 使用 formidable 解析 multipart/form-data 请求
    const { fields, files } = await new Promise((resolve, reject) => {
        form.parse(req, (err, fields, files) => {
            if (err) {
                console.error("[API ERROR] Formidable parsing error:", err);
                if (err.code === formidable.errors.biggerThanMaxFileSize) {
                    return reject({ status: 413, message: 'File too large. Max 5MB allowed.' });
                }
                return reject({ status: 500, message: 'File parsing error: ' + err.message });
            }
            console.log("[API DEBUG] Formidable parsed fields:", fields);
            console.log("[API DEBUG] Formidable parsed files:", files);
            resolve({ fields, files });
        });
    });

    const imageFile = files.image ? (Array.isArray(files.image) ? files.image[0] : files.image) : null;

    if (!imageFile) {
      console.error("[API ERROR] No image file found in request after parsing.");
      return res.status(400).json({ success: false, message: 'No image file uploaded.' });
    }

    console.log(`[API DEBUG] Image file received: ${imageFile.originalFilename} (${imageFile.mimetype}, ${imageFile.size} bytes)`);

    if (!process.env.GITHUB_TOKEN) {
        console.error('[API ERROR] GITHUB_TOKEN environment variable is not set.');
        return res.status(500).json({ success: false, message: 'Server configuration error: GitHub token missing.' });
    }

    const octokit = new Octokit({ 
      auth: process.env.GITHUB_TOKEN,
      userAgent: 'GitHub-Image-Uploader/APIv1',
      baseUrl: 'https://api.github.com'
    });

    const owner = 'yaojiwei520'; // <-- 替换为您的GitHub用户名
    const repo = 'yaojiwei520.github.io'; // <-- 替换为您的GitHub仓库名

    const imageBuffer = await fs.readFile(imageFile.filepath);
    const imageBase64 = imageBuffer.toString('base64');
    
    // 从 API 请求中获取 outputFormat 字段
    const requestedOutputFormat = fields.outputFormat ? fields.outputFormat[0].toLowerCase() : 'auto'; 
    
    let finalExt = '';
    if (['jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff', 'avif'].includes(requestedOutputFormat)) {
        finalExt = (requestedOutputFormat === 'jpeg') ? 'jpg' : requestedOutputFormat;
    } else { 
        let mimeExt = imageFile.mimetype.split('/')[1] || 'png';
        if (mimeExt === 'jpeg') mimeExt = 'jpg';
        finalExt = mimeExt;
    }

    // 生成文件名 (北京时间 + 随机后缀)
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Shanghai', 
        year: 'numeric', month: '2-digit', day: '2-digit', 
        hour: '2-digit', minute: '2-digit', second: '2-digit', 
        hour12: false
    });
    const parts = formatter.formatToParts(now);
    const year = parts.find(p => p.type === 'year')?.value || 'YYYY';
    const month = parts.find(p => p.type === 'month')?.value || 'MM';
    const day = parts.find(p => p.type === 'day')?.value || 'DD';
    const hour = parts.find(p => p.type === 'hour')?.value || 'HH';
    const minute = parts.find(p => p.type === 'minute')?.value || 'mm';
    const second = parts.find(p => p.type === 'second')?.value || 'ss';
    const datetimeString = `${year}${month}${day}${hour}${minute}${second}`;
    const randomSuffix = Math.random().toString(36).substr(2, 4); 
    const filename = `${datetimeString}_${randomSuffix}.${finalExt}`;
    
    const githubPath = `images/${filename}`; 

    console.log(`[API DEBUG] Attempting to upload ${filename} to GitHub.`);
    const uploadResult = await octokit.repos.createOrUpdateFileContents({
      owner: owner, repo: repo, path: githubPath, message: `API Upload image: ${filename}`, content: imageBase64,
      committer: { name: 'GitHub Image API', email: 'api@example.com' },
      author: { name: 'GitHub Image API', email: 'api@example.com' }
    });
    console.log(`[API DEBUG] GitHub upload successful for ${filename}. SHA: ${uploadResult.data.content.sha}`);

    // 在后端这里直接拼接 PROXY_PREFIX
    const originalGithubPagesCdnUrl = `https://${owner}.github.io/${githubPath}`; 
    const originalGithubBlobUrl = `https://github.com/${owner}/${repo}/blob/main/${githubPath}`;

    const proxiedGithubPagesCdnUrl = PROXY_PREFIX + originalGithubPagesCdnUrl; 
    const proxiedGithubBlobUrl = PROXY_PREFIX + originalGithubBlobUrl; 

    console.log(`[API SUCCESS] Final CDN URL (Proxied): ${proxiedGithubPagesCdnUrl}`);
    console.log(`[API SUCCESS] Final Blob URL (Proxied): ${proxiedGithubBlobUrl}`);
    
    res.status(200).json({
      success: true,
      url: proxiedGithubPagesCdnUrl, 
      delete_url: "https://api.yourdomain.com/delete?id=NotImplementedYet", 
      message: "图片上传成功！",
      blobUrlForInternalUse: proxiedGithubBlobUrl 
    });
    
  } catch (error) {
    console.error('[API ERROR] API Upload failed:', error);
    const errorMessage = error.message; 
    res.status(error.status || 500).json({ 
      success: false,
      message: errorMessage || '未知错误'
    });
  } finally {
    if (imageFile && imageFile.filepath) {
      try {
        await fs.unlink(imageFile.filepath); 
        console.log(`[API DEBUG] Cleaned up temporary file: ${imageFile.filepath}`);
      } catch (e) {
        console.error("[API ERROR] Error deleting temp file:", e);
      }
    }
  }
}

// 注意：这里仍然需要导出 config，Vercel 会正确处理 .mjs 文件的 bodyParser 禁用
export const config = {
    api: {
        bodyParser: false, 
    },
};