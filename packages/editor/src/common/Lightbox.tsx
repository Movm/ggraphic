// SPDX-License-Identifier: AGPL-3.0-only
import { useMessages } from '../i18n/messages.js';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog.js';

interface LightboxProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string;
  altText?: string;
}

export function Lightbox({ isOpen, onClose, imageSrc, altText }: LightboxProps) {
  const t = useMessages();
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-[95vw] sm:max-w-[95vw] w-auto max-h-[95vh] p-0 gap-0 border-none bg-transparent text-white shadow-none"
        overlayProps={{ className: 'bg-black/90 cursor-zoom-out', onClick: onClose }}
      >
        <DialogTitle className="sr-only">{t.shell.imagePreview}</DialogTitle>
        <DialogDescription className="sr-only">
          {altText || t.shell.enlargedImage}
        </DialogDescription>
        <img
          src={imageSrc}
          alt={altText || t.shell.enlargedImage}
          className="max-w-[95vw] max-h-[95vh] object-contain rounded-md"
        />
      </DialogContent>
    </Dialog>
  );
}
