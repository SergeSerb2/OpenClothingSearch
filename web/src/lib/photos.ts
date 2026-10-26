export function isPhoto(file: File): boolean {
  return file.type.startsWith("image/") || (!file.type && /\.(jpe?g|png|webp|heic|heif|avif|gif|bmp|tiff?)$/i.test(file.name));
}
