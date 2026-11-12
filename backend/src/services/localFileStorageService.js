const s3Storage = require('./s3FileStorageService');

module.exports = {
  uploadBuffer: s3Storage.uploadBuffer,
  getPresignedUrl: s3Storage.getPresignedUrl,
  openDownloadStream: s3Storage.openDownloadStream,
  getFileInfo: s3Storage.getFileInfo,
  deleteFile: s3Storage.deleteFile,
};
