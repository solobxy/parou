import React, { useState } from 'react';
import { Star } from 'lucide-react';
import { FavoriteItem } from '../types/favorites';
import { toggleFavorite, isItemFavorited } from '../services/favoritesService';

interface FavoriteButtonProps {
  item: Omit<FavoriteItem, 'addedAt'>;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
  onToggled?: (isFav: boolean) => void;
}

export const FavoriteButton: React.FC<FavoriteButtonProps> = ({
  item,
  size = 'md',
  showLabel = false,
  className = '',
  onToggled,
}) => {
  const [isFav, setIsFav] = useState<boolean>(() => isItemFavorited(item.id));

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    const newStatus = await toggleFavorite(item);
    setIsFav(newStatus);
    if (onToggled) onToggled(newStatus);
  };

  const sizeClasses = {
    xs: 'w-3 h-3',
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={isFav ? `Remover ${item.title} dos favoritos` : `Adicionar ${item.title} aos favoritos`}
      title={isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
      className={`inline-flex items-center justify-center rounded-[6px] min-h-[36px] min-w-[36px] p-1.5 transition-colors cursor-pointer ${
        isFav
          ? 'text-[#111111] bg-[#F4F4F2]'
          : 'text-[#6B6B6B] hover:text-[#111111] hover:bg-[#F4F4F2]'
      } ${className}`}
    >
      <Star
        className={`${sizeClasses[size]} stroke-[2] ${
          isFav ? 'fill-[#111111] text-[#111111]' : 'text-[#6B6B6B]'
        }`}
      />
      {showLabel && (
        <span className="ml-1.5 text-xs font-semibold text-[#111111]">
          {isFav ? 'Guardado' : 'Favorito'}
        </span>
      )}
    </button>
  );
};
