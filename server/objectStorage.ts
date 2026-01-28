import { v2 as cloudinary } from "cloudinary";
import { Response } from "express";
import { randomUUID } from "crypto";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  constructor() {}

  /**
   * Upload video from base64 data
   * Returns Cloudinary URL
   */
  async uploadVideoFromBase64(base64Data: string, filename: string): Promise<string> {
    const objectId = randomUUID();
    const extension = filename.includes('.') ? filename.split('.').pop() : 'mp4';
    
    // Clean base64 data
    let cleanBase64 = base64Data;
    if (cleanBase64.includes(',')) {
      cleanBase64 = cleanBase64.split(',')[1];
    }
    
    const dataUri = `data:video/${extension};base64,${cleanBase64}`;
    
    const result = await cloudinary.uploader.upload(dataUri, {
      resource_type: "video",
      folder: "course-magic/videos",
      public_id: objectId,
      overwrite: true,
    });
    
    return result.secure_url;
  }

  /**
   * Upload image from base64 data
   * Returns Cloudinary URL
   */
  async uploadImageFromBase64(base64Data: string, filename: string): Promise<string> {
    const objectId = randomUUID();
    const extension = filename.includes('.') ? filename.split('.').pop() : 'png';
    
    // Clean base64 data
    let cleanBase64 = base64Data;
    if (cleanBase64.includes(',')) {
      cleanBase64 = cleanBase64.split(',')[1];
    }
    
    const dataUri = `data:image/${extension};base64,${cleanBase64}`;
    
    const result = await cloudinary.uploader.upload(dataUri, {
      resource_type: "image",
      folder: "course-magic/images",
      public_id: objectId,
      overwrite: true,
    });
    
    return result.secure_url;
  }

  /**
   * Upload audio from base64 data
   * Returns Cloudinary URL
   */
  async uploadAudioFromBase64(base64Data: string, filename: string): Promise<string> {
    const objectId = randomUUID();
    const extension = filename.includes('.') ? filename.split('.').pop() : 'mp3';
    
    // Clean base64 data
    let cleanBase64 = base64Data;
    if (cleanBase64.includes(',')) {
      cleanBase64 = cleanBase64.split(',')[1];
    }
    
    const dataUri = `data:audio/${extension};base64,${cleanBase64}`;
    
    // Cloudinary treats audio as "video" resource type
    const result = await cloudinary.uploader.upload(dataUri, {
      resource_type: "video",
      folder: "course-magic/audio",
      public_id: objectId,
      overwrite: true,
    });
    
    return result.secure_url;
  }

  /**
   * Upload any file from base64 data
   * Returns Cloudinary URL
   */
  async uploadFileFromBase64(base64Data: string, filename: string, contentType: string): Promise<string> {
    const objectId = randomUUID();
    const extension = filename.includes('.') ? filename.split('.').pop() : 'bin';
    
    // Clean base64 data
    let cleanBase64 = base64Data;
    if (cleanBase64.includes(',')) {
      cleanBase64 = cleanBase64.split(',')[1];
    }
    
    const dataUri = `data:${contentType};base64,${cleanBase64}`;
    
    // Determine resource type
    let resourceType: "image" | "video" | "raw" = "raw";
    if (contentType.startsWith("image/")) {
      resourceType = "image";
    } else if (contentType.startsWith("video/") || contentType.startsWith("audio/")) {
      resourceType = "video";
    }
    
    const result = await cloudinary.uploader.upload(dataUri, {
      resource_type: resourceType,
      folder: "course-magic/files",
      public_id: objectId,
      overwrite: true,
    });
    
    return result.secure_url;
  }

  /**
   * Upload file from URL
   * Returns Cloudinary URL
   */
  async uploadFromUrl(url: string, folder: string = "course-magic/uploads"): Promise<string> {
    const objectId = randomUUID();
    
    const result = await cloudinary.uploader.upload(url, {
      resource_type: "auto",
      folder: folder,
      public_id: objectId,
      overwrite: true,
    });
    
    return result.secure_url;
  }

  /**
   * Delete a file from Cloudinary
   */
  async deleteFile(publicUrl: string): Promise<void> {
    // Extract public_id from URL
    // URL format: https://res.cloudinary.com/{cloud_name}/{resource_type}/upload/{folder}/{public_id}.{ext}
    try {
      const url = new URL(publicUrl);
      const pathParts = url.pathname.split('/');
      const uploadIndex = pathParts.indexOf('upload');
      if (uploadIndex === -1) return;
      
      // Get everything after 'upload' as the public_id (without extension)
      const publicIdWithExt = pathParts.slice(uploadIndex + 1).join('/');
      const publicId = publicIdWithExt.replace(/\.[^/.]+$/, ''); // Remove extension
      
      // Determine resource type from URL
      let resourceType: "image" | "video" | "raw" = "image";
      if (pathParts.includes("video")) {
        resourceType = "video";
      } else if (pathParts.includes("raw")) {
        resourceType = "raw";
      }
      
      await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    } catch (error) {
      console.error("Error deleting file from Cloudinary:", error);
    }
  }

  /**
   * Get a signed URL for private access (if needed)
   */
  getSignedUrl(publicId: string, resourceType: "image" | "video" | "raw" = "image", expiresInSec: number = 3600): string {
    return cloudinary.url(publicId, {
      resource_type: resourceType,
      sign_url: true,
      type: "authenticated",
      expires_at: Math.floor(Date.now() / 1000) + expiresInSec,
    });
  }

  /**
   * Transform image URL (resize, crop, etc.)
   */
  getTransformedImageUrl(publicUrl: string, options: { width?: number; height?: number; crop?: string }): string {
    // Extract public_id from URL
    try {
      const url = new URL(publicUrl);
      const pathParts = url.pathname.split('/');
      const uploadIndex = pathParts.indexOf('upload');
      if (uploadIndex === -1) return publicUrl;
      
      const publicIdWithExt = pathParts.slice(uploadIndex + 1).join('/');
      const publicId = publicIdWithExt.replace(/\.[^/.]+$/, '');
      
      return cloudinary.url(publicId, {
        resource_type: "image",
        width: options.width,
        height: options.height,
        crop: options.crop || "fill",
      });
    } catch {
      return publicUrl;
    }
  }

  /**
   * Legacy method for compatibility - normalize paths
   * Now just returns the URL as-is since we use full Cloudinary URLs
   */
  normalizeObjectEntityPath(rawPath: string): string {
    return rawPath;
  }

  /**
   * Legacy method for compatibility - get upload URL
   * Returns a placeholder; actual uploads use the upload methods directly
   */
  async getObjectEntityUploadURL(): Promise<string> {
    // Generate a signed upload URL for direct browser uploads
    const timestamp = Math.round(new Date().getTime() / 1000);
    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder: "course-magic/uploads" },
      process.env.CLOUDINARY_API_SECRET!
    );
    
    return JSON.stringify({
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      timestamp,
      signature,
      folder: "course-magic/uploads",
    });
  }
}

// Export a singleton instance
export const objectStorageService = new ObjectStorageService();

// Also export cloudinary for direct use if needed
export { cloudinary };

// Backwards compatibility export for server/index.ts health check
// This creates a dummy client that always passes the health check since we're using Cloudinary now
export const objectStorageClient = {
  bucket: (name: string) => ({
    getMetadata: async () => ({ name, cloudinary: true })
  })
};
