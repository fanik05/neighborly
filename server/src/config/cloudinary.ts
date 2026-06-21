import { v2 as cloudinary } from 'cloudinary';
import type { ItemImage } from '@neighborly/shared';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/** Upload an in-memory file buffer to Cloudinary. */
export function uploadBuffer(buffer: Buffer, folder = 'neighborly/items'): Promise<ItemImage> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder }, (err, result) => {
      if (err || !result) return reject(err ?? new Error('Cloudinary upload failed'));
      resolve({ url: result.secure_url, publicId: result.public_id });
    });
    stream.end(buffer);
  });
}

/** Delete assets by their Cloudinary publicId. */
export async function destroyAssets(publicIds: string[] = []): Promise<void> {
  await Promise.all(publicIds.map((id) => cloudinary.uploader.destroy(id)));
}

export default cloudinary;
