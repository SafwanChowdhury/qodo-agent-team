import { useEffect, useState, useCallback } from 'react';
import { Folder, FolderOpen, ChevronUp, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useRunStore } from '@/store/runStore';
import type { BrowseResult } from '@/types';

export function FolderBrowser() {
  const showFolderBrowser = useRunStore((s) => s.showFolderBrowser);
  const browserPath = useRunStore((s) => s.browserPath);
  const browserDirs = useRunStore((s) => s.browserDirs);
  const browserParent = useRunStore((s) => s.browserParent);
  const setBrowserData = useRunStore((s) => s.setBrowserData);
  const setShowFolderBrowser = useRunStore((s) => s.setShowFolderBrowser);
  const setProjectPath = useRunStore((s) => s.setProjectPath);

  const [selectedDir, setSelectedDir] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const browse = useCallback(
    async (path: string) => {
      setLoading(true);
      setError(null);
      setSelectedDir(null);

      try {
        const params = new URLSearchParams({ path });
        const res = await fetch(`/api/browse?${params.toString()}`);

        if (!res.ok) {
          throw new Error(`Browse failed: ${res.status} ${res.statusText}`);
        }

        const data: BrowseResult = await res.json();
        setBrowserData({ path: data.current, dirs: data.dirs, parent: data.parent });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to browse directory');
      } finally {
        setLoading(false);
      }
    },
    [setBrowserData],
  );

  useEffect(() => {
    if (showFolderBrowser) {
      const initialPath = browserPath || '/';
      browse(initialPath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFolderBrowser]);

  function handleClose() {
    setShowFolderBrowser(false);
    setSelectedDir(null);
    setError(null);
  }

  function handleSelect() {
    const chosen = selectedDir ?? browserPath;
    if (chosen) {
      setProjectPath(chosen);
    }
    handleClose();
  }

  function handleSingleClick(dirPath: string) {
    setSelectedDir(dirPath);
  }

  function handleDoubleClick(dirPath: string) {
    browse(dirPath);
  }

  function handleGoUp() {
    if (browserParent) {
      browse(browserParent);
    }
  }

  return (
    <Dialog open={showFolderBrowser} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-xl w-full p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-[#D4C5B0]">
          <DialogTitle>Browse Folders</DialogTitle>

          <div className="mt-2 flex items-center gap-2 rounded-md bg-[#F9F6F1] border border-[#D4C5B0] px-3 py-2">
            <Folder className="h-3.5 w-3.5 text-[#5C1A1A] shrink-0" />
            <span className="font-mono text-xs text-[#7A5C4A] truncate leading-none">
              {browserPath || '/'}
            </span>
          </div>
        </DialogHeader>

        {/* Directory listing */}
        <div className="relative min-h-[280px] max-h-[380px] overflow-y-auto bg-white">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
              <Loader2 className="h-5 w-5 text-[#5C1A1A] animate-spin" />
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-full px-5 py-8">
              <p className="text-sm text-[#B71C1C] text-center">{error}</p>
            </div>
          )}

          {!error && (
            <ul className="py-1">
              {browserParent && (
                <li>
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-[#7A5C4A] hover:bg-[#F9F3EC] hover:text-[#2C1810] transition-colors text-left"
                    onClick={handleGoUp}
                    onDoubleClick={handleGoUp}
                  >
                    <ChevronUp className="h-4 w-4 text-[#A08570] shrink-0" />
                    <span className="font-mono text-xs">..</span>
                  </button>
                </li>
              )}

              {browserDirs.length === 0 && !loading && (
                <li className="px-4 py-6 text-center text-sm text-[#A08570]">
                  No subdirectories found
                </li>
              )}

              {browserDirs.map((dir) => {
                const isSelected = selectedDir === dir.path;
                return (
                  <li key={dir.path}>
                    <button
                      type="button"
                      className={[
                        'w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors text-left',
                        isSelected
                          ? 'bg-[#F3EDE3] text-[#2C1810] border-l-2 border-[#5C1A1A]'
                          : 'text-[#2C1810] hover:bg-[#F9F3EC]',
                      ].join(' ')}
                      onClick={() => handleSingleClick(dir.path)}
                      onDoubleClick={() => handleDoubleClick(dir.path)}
                    >
                      {isSelected ? (
                        <FolderOpen className="h-4 w-4 text-[#5C1A1A] shrink-0" />
                      ) : (
                        <Folder className="h-4 w-4 text-[#8B6914] shrink-0" />
                      )}
                      <span className="font-mono text-xs truncate">{dir.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[#D4C5B0] bg-[#F9F6F1] flex flex-col gap-3">
          <p className="text-xs text-[#A08570] truncate min-w-0">
            {selectedDir ? (
              <>
                <span className="text-[#7A5C4A]">Selected: </span>
                <span className="font-mono text-[#2C1810]">{selectedDir}</span>
              </>
            ) : (
              <span className="italic">Double-click to navigate, single-click to select</span>
            )}
          </p>

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleSelect}
              disabled={loading}
            >
              Select This Folder
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
