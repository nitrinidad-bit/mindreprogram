/**
 * Storage Service - Supports S3 (production) and Google Drive (testing)
 *
 * For testing: set STORAGE_MODE=gdrive in .env
 * Store Google Drive direct links in the meditation's audio_s3_key field
 * Format: https://drive.google.com/uc?id=FILE_ID&export=download
 *
 * For production: set STORAGE_MODE=s3 and configure AWS credentials
 */

const STORAGE_MODE = process.env.STORAGE_MODE || 'gdrive';

// S3 setup (lazy-loaded only when needed)
let s3, getSignedUrl;
if (STORAGE_MODE === 's3') {
  const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
  const presigner = require('@aws-sdk/s3-request-presigner');
  getSignedUrl = presigner.getSignedUrl;

  s3 = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

const BUCKET = process.env.AWS_S3_BUCKET;

const StorageService = {
  async getUploadUrl(key, contentType = 'audio/mpeg') {
    if (STORAGE_MODE === 'gdrive') {
      // For Google Drive mode, admin provides the Drive link directly
      return null;
    }

    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
    });
    return await getSignedUrl(s3, command, { expiresIn: 3600 });
  },

  async getStreamUrl(key) {
    if (STORAGE_MODE === 'gdrive') {
      // key is already a Google Drive direct download URL or file ID
      if (key.startsWith('http')) {
        return key;
      }
      // If just a file ID, build the direct link
      return `https://drive.google.com/uc?id=${key}&export=download`;
    }

    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    });
    return await getSignedUrl(s3, command, { expiresIn: 900 });
  },

  async deleteFile(key) {
    if (STORAGE_MODE === 'gdrive') return; // No-op for Drive

    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    const command = new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    });
    await s3.send(command);
  },

  generateKey(category, filename) {
    if (STORAGE_MODE === 'gdrive') {
      // For Drive mode, the admin will paste the Google Drive link
      return filename; // Will be replaced with the actual Drive URL
    }
    const timestamp = Date.now();
    const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `meditations/${category}/${timestamp}_${sanitized}`;
  },
};

module.exports = StorageService;
