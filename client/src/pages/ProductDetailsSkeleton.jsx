import Skeleton from "../components/Skeleton";

function ProductDetailsSkeleton() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-3">
          <Skeleton className="aspect-square rounded-xl" />
          <div className="grid grid-cols-3 sm:grid-cols-1 gap-3">
            <Skeleton className="aspect-square rounded-xl" />
            <Skeleton className="aspect-square rounded-xl" />
            <Skeleton className="aspect-square rounded-xl" />
          </div>
        </div>

        <div>
          <Skeleton className="h-4 w-24 mb-3" />
          <Skeleton className="h-8 w-3/4 mb-3" />
          <Skeleton className="h-4 w-32 mb-5" />
          <Skeleton className="h-9 w-40 mb-6" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-2/3 mb-6" />
          <Skeleton className="h-12 w-full rounded-lg mb-3" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export default ProductDetailsSkeleton;
