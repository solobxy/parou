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
  const [isAnimating, setIsAnimating] = useState<boolean>(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    setIsAnimating(true);
    const newStatus = await toggleFavorite(item);
    setIsFav(newStatus);
    if (onToggled) onToggled(newStatus);

    setTimeout(() => {
      setIsAnimating(false);
    }, 400);
  };

  const sizeClasses = {
    xs: 'w-3 h-3',
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  const buttonPadding = {
    xs: 'p-1',
    sm: 'p-1.5',
    md: 'p-2',
    lg: 'p-2.5',
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={isFav ? `Remover ${item.title} dos favoritos` : `Adicionar ${item.title} aos favoritos`}
      title={isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
      className={`relative inline-flex items-center justify-center rounded-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${buttonPadding[size]} ${
        isFav
          ? 'text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.15)]'
          : 'text-slate-400 hover:text-amber-300 hover:bg-slate-800/60 border border-slate-700/50'
      } ${className}`}
    >
      <Star
        className={`${sizeClasses[size]} transition-transform duration-200 ${
          isFav ? 'fill-amber-400 text-amber-400' : 'text-slate-400'
        } ${isAnimating ? 'scale-125 rotate-12' : 'scale-100'}`}
      />
      {showLabel && (
        <span className="ml-1.5 text-xs font-semibold">
          {isFav ? 'Guardado' : 'Favorito'}
        </span>
      )}
    </button>
  );
};
