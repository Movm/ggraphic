// SPDX-License-Identifier: AGPL-3.0-only
import { useCanvasEditorServices } from '../../CanvasEditorProvider.js';
import { useMessages } from '../../i18n/messages.js';
import { browserFileDelivery } from '../../hostServices.js';
import { useAutoSaveStoreApi } from '../../stores/useAutoSaveStore.js';
import { Button } from '../../ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '../../ui/dialog.js';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '../../ui/popover.js';
import { Skeleton } from '../../ui/skeleton.js';
import { cn } from '../../utils/cn.js';
import { stripInlineMarks } from '@ggraphic/schema';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { IoShareOutline } from 'react-icons/io5';
import {
  PiArrowLeft,
  PiMegaphone,
  PiCheck,
  PiDownloadSimple,
  PiFloppyDisk,
  PiNotePencil,
  PiUserPlus,
} from 'react-icons/pi';

import { useIsCanvasMobile } from '../../hooks/useIsCanvasMobile.js';
import {
  AltTextField,
  useCaptionAltText,
  useShareAltText,
  withAltText,
} from '../../sidebar/components/AltTextField.js';
import { withPhotoCredit } from '../../utils/photoCredit.js';

import {
  DownloadSection,
  type CanvasDownloadChoice,
  type PrintExportProps,
  type SlideDeckExportProps,
  type VectorExportProps,
} from './DownloadSection.js';

/** Navigation inside the share panel, handed to host-rendered sections and pages. */
export interface ShareNav {
  /** Open a host-rendered sub-page inside the panel (back arrow returns to main). */
  openPage: (page: { title: string; render: (nav: ShareNav) => ReactNode }) => void;
  back: () => void;
  close: () => void;
  /** PNG data URL of the current page, or null when the capture fails. */
  captureImage: () => Promise<string | null>;
}

/** A host-supplied tile in the share panel. */
export interface ShareAction {
  id: string;
  label: string;
  icon: ReactNode;
  /** Small attention dot on the tile. */
  attention?: boolean;
  disabled?: boolean;
  /** Either run something … */
  onSelect?: (nav: ShareNav) => void;
  /** … or open a sub-page with this content. */
  page?: { title: string; render: (nav: ShareNav) => ReactNode };
}

type ShareView = 'main' | 'download' | 'describe' | { custom: string };

export interface ShareDropdownProps {
  onCaptureCanvas: () => Promise<string | null>;
  onDownload: (
    format: CanvasDownloadChoice,
    pixelRatio: number,
    transparent: boolean
  ) => void | Promise<void>;
  onNavigateToGallery: () => void;
  canvasText: string;
  canvasType: string;
  canvasWidth: number;
  canvasHeight: number;
  shareToken: string | null;
  pageCount?: number;
  onDownloadAllZip?: (format?: CanvasDownloadChoice) => Promise<void>;
  onShareAllPages?: () => Promise<void>;
  isMultiExporting?: boolean;
  exportProgress?: { current: number; total: number };
  exportError?: string | null;
  exportNotice?: string | null;
  /** Set for print formats: the download section offers the print PDF. */
  printExport?: PrintExportProps | null;
  /** Set for slide formats: the download section offers PowerPoint and a PDF of all pages. */
  slideDeck?: SlideDeckExportProps | null;
  /** SVG download; without it the download section offers no SVG. */
  vectorExport?: VectorExportProps | null;
  /**
   * Optional host-supplied "invite people" action. When provided, the share
   * popover shows a "Personen" icon button that opens the host's collaborator
   * dialog. Kept opaque so the canvas-editor package stays unaware of who
   * resolves people/permissions.
   *
   * @deprecated Render the access controls with {@link accessSection} instead;
   * the tile is hidden when `accessSection` is set.
   */
  onInvitePeople?: () => void;
  /**
   * Host-owned access section, rendered right under the heading, above the
   * tiles. The editor draws nothing of its own there. `nav.openPage` opens a
   * sub-page inside the panel.
   */
  accessSection?: (nav: ShareNav) => ReactNode;
  /** Host tiles between "Download" and "Vorlage", in the given order. */
  shareActions?: ShareAction[];
  /**
   * Optional host-supplied "save as template" action, same contract as
   * {@link onInvitePeople}: the host owns the document identity a template is
   * built from, so it also owns the dialog. Hidden when absent.
   */
  onSaveAsTemplate?: () => void;
  /**
   * Opened by a host-drawn bar instead of the "Teilen" button: the menu is
   * controlled from outside and hangs from the top right of the editor.
   */
  hostControl?: { open: boolean; onOpenChange: (open: boolean) => void };
  /**
   * Bildnachweis aller Seiten („Foto: … auf Unsplash"), gelesen beim Öffnen.
   * Unsplash verlangt ihn im Beitragstext: er wird an den geteilten Text
   * gehängt und zum Kopieren angezeigt, weil Instagram & Co. den Text eines
   * geteilten Bilds verwerfen.
   */
  getPhotoCredit?: () => string;
}

export function ShareDropdown({
  onCaptureCanvas,
  onDownload,
  onNavigateToGallery,
  canvasText,
  canvasWidth,
  canvasHeight,
  shareToken,
  pageCount = 1,
  onDownloadAllZip,
  onShareAllPages,
  isMultiExporting = false,
  exportProgress,
  exportError,
  exportNotice,
  printExport,
  slideDeck,
  vectorExport,
  onInvitePeople,
  accessSection,
  shareActions,
  onSaveAsTemplate,
  hostControl,
  getPhotoCredit,
}: ShareDropdownProps) {
  const t = useMessages();
  const isMobile = useIsCanvasMobile();
  const [ownOpen, setOwnOpen] = useState(false);
  const open = hostControl ? hostControl.open : ownOpen;
  const setOpen = hostControl ? hostControl.onOpenChange : setOwnOpen;
  const [view, setView] = useState<ShareView>('main');
  const [customPage, setCustomPage] = useState<{
    title: string;
    render: (nav: ShareNav) => ReactNode;
  } | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);
  const [postCopied, setPostCopied] = useState(false);
  const photoCredit = useMemo(
    () => (open && getPhotoCredit ? getPhotoCredit() : ''),
    [open, getPhotoCredit]
  );
  const [altText, setAltText] = useShareAltText(stripInlineMarks(canvasText));
  const captionAltText = useCaptionAltText(altText);
  const shareText = withAltText(withPhotoCredit(canvasText, photoCredit), captionAltText);

  const autoSaveStoreApi = useAutoSaveStoreApi();
  const { fileDelivery = browserFileDelivery, imageShares, feedback } = useCanvasEditorServices();
  const shareRoute = fileDelivery.pickShareRoute();
  const shareFileName = `${fileDelivery.filenamePrefix ?? 'ggraphic'}.png`;
  const shareTitle = fileDelivery.shareTitle ?? 'ggraphic';

  const publishDraftIfNeeded = useCallback(async () => {
    const token = shareToken || autoSaveStoreApi.getState().autoSavedShareToken;
    if (token && imageShares) {
      try {
        await imageShares.publishShare(token);
      } catch (err) {
        console.warn('[ShareDropdown] Failed to publish draft:', err);
      }
    }
  }, [shareToken, autoSaveStoreApi, imageShares]);

  const handleNativeShare = useCallback(async () => {
    setIsSharing(true);
    try {
      const dataUrl = await onCaptureCanvas();
      if (!dataUrl) return;
      if (shareRoute === 'native-host') {
        fileDelivery.shareDataUrlViaNativeHost(dataUrl, shareFileName, {
          title: shareTitle,
          text: shareText,
        });
      } else {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], shareFileName, { type: 'image/png' });

        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], text: shareText, title: shareTitle });
        } else {
          await navigator.share({ text: shareText, title: shareTitle });
        }
      }
      void publishDraftIfNeeded();
      setShareSuccess(true);
      setTimeout(() => setShareSuccess(false), 2000);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') console.error('Share failed:', err);
    } finally {
      setIsSharing(false);
    }
  }, [
    onCaptureCanvas,
    shareText,
    publishDraftIfNeeded,
    shareRoute,
    fileDelivery,
    shareFileName,
    shareTitle,
  ]);

  const closePanel = useCallback(() => {
    setOpen(false);
    setView('main');
  }, [setOpen]);

  const nav = useMemo<ShareNav>(
    () => ({
      openPage: (page) => {
        setCustomPage(page);
        setView({ custom: page.title });
      },
      back: () => setView('main'),
      close: closePanel,
      captureImage: onCaptureCanvas,
    }),
    [closePanel, onCaptureCanvas]
  );

  const copyPostText = () => {
    if (!navigator.clipboard?.writeText) return;
    void navigator.clipboard.writeText(shareText).then(() => {
      setPostCopied(true);
      setTimeout(() => setPostCopied(false), 2000);
    });
  };

  const nativeShareTile =
    shareRoute !== null ? (
      <ShareTile
        key="native-share"
        icon={
          isSharing ? (
            <Skeleton className="size-4 rounded-full" />
          ) : shareSuccess ? (
            <PiCheck />
          ) : (
            <IoShareOutline />
          )
        }
        label={shareSuccess ? t.shell.shared : t.shell.send}
        onClick={handleNativeShare}
        disabled={isSharing}
      />
    ) : null;

  const panelTitle = (title: string) => (
    <div className="flex items-center">
      <button
        type="button"
        onClick={() => setView('main')}
        className="flex items-center gap-2 bg-transparent border-none cursor-pointer p-0 text-sm font-semibold text-foreground transition-colors duration-150 hover:text-primary-600"
      >
        <PiArrowLeft size={16} aria-hidden />
        {title}
      </button>
    </div>
  );

  const subPage = (title: string, children: ReactNode) => (
    <div className="flex flex-col gap-4 animate-in fade-in-0 slide-in-from-right-4 duration-200 motion-reduce:animate-none">
      {panelTitle(title)}
      {children}
    </div>
  );

  let content: ReactNode;
  if (view === 'download') {
    content = subPage(
      t.shell.downloadTab,
      <DownloadSection
        onDownload={onDownload}
        onDownloadAllZip={onDownloadAllZip}
        pageCount={pageCount}
        isMultiExporting={isMultiExporting}
        exportProgress={exportProgress}
        exportError={exportError}
        exportNotice={exportNotice}
        printExport={printExport}
        slideDeck={slideDeck}
        vectorExport={vectorExport}
      />
    );
  } else if (view === 'describe') {
    content = subPage(
      t.shell.describe,
      <>
        <AltTextField value={altText} onChange={setAltText} />
        {photoCredit && (
          <div className="flex flex-col gap-2 rounded-md border border-[var(--editor-border-soft)] p-3">
            <p className="m-0 text-xs font-semibold text-foreground">{t.credit.heading}</p>
            <p className="m-0 text-xs text-muted-foreground">{t.credit.notYours}</p>
            <p className="m-0 select-all text-sm text-foreground">{photoCredit}</p>
          </div>
        )}
        <Button onClick={copyPostText}>
          {postCopied ? <PiCheck className="size-4" /> : null}
          {postCopied ? t.shell.copied : t.shell.copyPostText}
        </Button>
      </>
    );
  } else if (typeof view === 'object') {
    content = subPage(customPage?.title ?? view.custom, customPage?.render(nav) ?? null);
  } else {
    content = (
      <div className="flex flex-col gap-[18px]">
        <h3 className="text-base font-semibold text-foreground m-0">{t.shell.share}</h3>
        {accessSection && (
          <>
            <div>{accessSection(nav)}</div>
            <hr className="m-0 border-0 border-t border-[var(--editor-border-soft)]" />
          </>
        )}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(72px,1fr))] gap-x-3 gap-y-[14px]">
          {isMobile && nativeShareTile}
          <ShareTile
            icon={<PiDownloadSimple />}
            label={t.shell.downloadTab}
            onClick={() => setView('download')}
          />
          {shareActions?.map((action) => (
            <ShareTile
              key={action.id}
              icon={action.icon}
              label={action.label}
              attention={action.attention}
              disabled={action.disabled}
              onClick={() => {
                if (action.page) nav.openPage(action.page);
                else action.onSelect?.(nav);
              }}
            />
          ))}
          {onSaveAsTemplate && (
            <ShareTile
              icon={<PiFloppyDisk />}
              label={t.shell.template}
              onClick={() => {
                closePanel();
                onSaveAsTemplate();
              }}
            />
          )}
          <ShareTile
            icon={<PiNotePencil />}
            label={t.shell.describe}
            attention={!altText.trim()}
            onClick={() => setView('describe')}
          />
          {onInvitePeople && !accessSection && (
            <ShareTile
              icon={<PiUserPlus />}
              label={t.shell.people}
              onClick={() => {
                closePanel();
                onInvitePeople();
              }}
            />
          )}
          {/* Mobil schwebt kein Feedback-Knopf über dem Editor — er wohnt hier. */}
          {isMobile && feedback?.canRequest() && (
            <ShareTile
              icon={<PiMegaphone />}
              label={t.shell.feedback}
              onClick={() => {
                closePanel();
                feedback?.request();
              }}
            />
          )}
          {!isMobile && nativeShareTile}
        </div>
      </div>
    );
  }

  const trigger = hostControl ? null : (
    <Button
      size="sm"
      className="ml-auto h-9 rounded-full bg-white px-4 font-extrabold text-[var(--editor-green-deep)] hover:bg-white/90 max-canvas-mobile:h-8 max-canvas-mobile:px-3"
    >
      <IoShareOutline className="size-4" />
      <span>{t.shell.share}</span>
    </Button>
  );

  const onOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) setView('main');
  };

  if (isMobile) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
        <DialogContent
          showCloseButton={false}
          aria-describedby={undefined}
          className={cn(
            'top-auto bottom-0 left-0 max-h-[85dvh] w-full max-w-full translate-x-0 translate-y-0 gap-0 overflow-y-auto rounded-t-2xl rounded-b-none border-x-0 border-b-0 p-5 pt-3 sm:max-w-full',
            'pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]',
            'data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom data-[state=open]:zoom-in-100 data-[state=closed]:zoom-out-100'
          )}
        >
          <div
            aria-hidden
            className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-[var(--editor-border)]"
          />
          <DialogTitle className="sr-only">{t.shell.share}</DialogTitle>
          <DialogDescription className="sr-only">{t.shell.share}</DialogDescription>
          {content}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {hostControl ? (
        <PopoverAnchor className="absolute right-3 top-0 size-0" />
      ) : (
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      )}
      <PopoverContent align="end" sideOffset={8} className="w-96 max-w-[calc(100vw-1rem)] p-5">
        {content}
      </PopoverContent>
    </Popover>
  );
}

/** A round icon with its label underneath; the grid cell the share panel is built from. */
function ShareTile({
  icon,
  label,
  attention = false,
  className,
  ...props
}: Omit<React.ComponentProps<'button'>, 'children'> & {
  icon: ReactNode;
  label: string;
  attention?: boolean;
}) {
  return (
    <button
      type="button"
      data-slot="share-tile"
      className={cn(
        'group flex cursor-pointer flex-col items-center gap-2 border-none bg-transparent p-0 disabled:cursor-default disabled:opacity-50',
        className
      )}
      {...props}
    >
      <span
        className={cn(
          'relative flex size-11 items-center justify-center rounded-full text-xl',
          'bg-editor-icon-button-bg text-editor-icon-button-fg transition-all duration-200',
          'group-hover:bg-editor-icon-button-bg-hover group-hover:scale-105 group-disabled:scale-100',
          '[box-shadow:var(--editor-icon-button-shadow)]'
        )}
      >
        {icon}
        {attention && (
          <span
            data-slot="share-tile-attention"
            aria-hidden
            className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-[var(--editor-surface)] bg-[var(--editor-danger-fg)]"
          />
        )}
      </span>
      <span className="text-center text-[12.5px] leading-tight text-foreground [hyphens:none] [text-wrap:balance]">
        {label}
      </span>
    </button>
  );
}
