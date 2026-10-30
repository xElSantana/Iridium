import { FiImage, FiUpload } from "react-icons/fi";

interface UploadPromptProps {
  addImages: string;
  dropPrompt: string;
  selectFiles: string;
}

export default function UploadPrompt({ addImages, dropPrompt, selectFiles }: UploadPromptProps) {
  return (
    <span className="flex flex-col items-center p-6">
      <span
        aria-hidden="true"
        className="relative mb-2 grid h-12 w-16 place-items-center text-foreground-faint"
      >
        <FiImage size={42} />
        <span className="absolute bottom-0 -right-1 grid size-6 place-items-center rounded-full bg-accent text-on-accent">
          <FiUpload size={15} />
        </span>
      </span>
      <span className="text-base font-bold text-foreground" data-i18n="upload.addImages">
        {addImages}
      </span>
      <span className="mt-1.5 text-xs text-foreground-soft">
        <span data-i18n="upload.dropPrompt">{dropPrompt}</span>{" "}
        <span className="font-bold text-accent" data-i18n="upload.selectFiles">
          {selectFiles}
        </span>
      </span>
    </span>
  );
}
