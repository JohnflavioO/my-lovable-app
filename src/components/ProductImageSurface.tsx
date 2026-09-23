import { cn } from "@/lib/utils";

interface ProductImageSurfaceProps {
  src?: string;
  alt?: string;
  className?: string;
  containerClassName?: string;
}

export function ProductImageSurface({
  src,
  alt,
  className,
  containerClassName,
}: ProductImageSurfaceProps) {
  return (
    <div 
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-md bg-white p-2 border border-slate-100 dark:border-slate-800",
        containerClassName
      )}
    >
      <img
        src={src || "/placeholder.svg"}
        alt={alt || "Product image"}
        className={cn("h-full w-full object-contain mix-blend-multiply", className)}
        loading="lazy"
      />
    </div>
  );
}
