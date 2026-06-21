import multer from 'multer';

/** In-memory storage — buffers stream straight to Cloudinary, nothing hits disk. */
const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 5 }, // 5MB each, up to 5 images
  fileFilter(_req, file, cb) {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  },
});
