'use client';

import type { StockItem } from '@/stores/stock-store';
import StockMediaCard from '@/components/stock/StockMediaCard';

interface StockMediaGridProps {
  items: StockItem[];
  onAddToVideo: (item: StockItem) => void;
  onDownload: (item: StockItem) => void;
}

/** Responsive grid of stock media cards (2 cols mobile, 3 tablet, 4 desktop). */
export default function StockMediaGrid({ items, onAddToVideo, onDownload }: StockMediaGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {items.map((item) => (
        <StockMediaCard
          key={`${item.source}-${item.id}`}
          item={item}
          onAddToVideo={onAddToVideo}
          onDownload={onDownload}
        />
      ))}
    </div>
  );
}
