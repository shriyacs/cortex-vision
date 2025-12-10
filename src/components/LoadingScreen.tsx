/**
 * Loading screen with animated quote rotation
 */

export const QUIRKY_QUOTES = [
  "Imagining your vision...",
  "Consulting with the code gods...",
  "Untangling the spaghetti...",
  "Mapping the neural pathways...",
  "Brewing some architecture magic...",
  "Translating chaos into clarity...",
];

interface LoadingScreenProps {
  currentQuote: string;
}

export const LoadingScreen = ({ currentQuote }: LoadingScreenProps) => {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center">
      <div className="space-y-8 text-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="text-lg text-muted-foreground animate-pulse">
            {currentQuote}
          </p>
        </div>
        <p className="text-xs text-muted-foreground tracking-widest uppercase">
          Analysis in progress
        </p>
      </div>
    </div>
  );
};
