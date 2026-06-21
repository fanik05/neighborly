'use client';

import { useRef, useState } from 'react';

interface Props {
  onChange: (files: File[]) => void;
  max?: number;
}

/** Local image picker with thumbnail previews. Hands the File[] to the parent;
 *  the actual Cloudinary upload happens server-side on submit. */
export default function ImageUploader({ onChange, max = 5 }: Props) {
  const [previews, setPreviews] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    const files = Array.from(fileList).slice(0, max);
    setPreviews(files.map((f) => URL.createObjectURL(f)));
    onChange(files);
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex w-full flex-col items-center justify-center gap-1 rounded-tag border-2 border-dashed border-line bg-white py-8 text-muted hover:border-pine"
      >
        <span className="text-2xl">📷</span>
        <span className="text-sm font-medium">Add up to {max} photos</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {previews.length > 0 && (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {previews.map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt="preview" className="aspect-square w-full rounded-lg object-cover" />
          ))}
        </div>
      )}
    </div>
  );
}
