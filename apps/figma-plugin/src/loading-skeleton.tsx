import { Container, VerticalSpace } from "@create-figma-plugin/ui";

function SkeletonBlock({
  className = "",
  style,
}: {
  className?: string;
  style?: { width?: string; height?: string };
}) {
  return (
    <div
      className={`skeleton ${className}`.trim()}
      style={style}
      aria-hidden="true"
      role="presentation"
    />
  );
}

export function WorkflowSkeleton({ includeFooterAction = false }: { includeFooterAction?: boolean }) {
  return (
    <Container space="small">
      <div className="workflowTop">
        <SkeletonBlock className="skeletonLine skeletonProjectLine" />
        <VerticalSpace space="medium" />
        <SkeletonBlock className="skeletonLine skeletonLabel" />
        <VerticalSpace space="extraSmall" />
        <SkeletonBlock className="skeletonDropdown" />
        <VerticalSpace space="extraSmall" />
        <SkeletonBlock className="skeletonLine skeletonHint" />
        <VerticalSpace space="medium" />
        <SkeletonBlock className="skeletonDivider" />
        <VerticalSpace space="medium" />
        <SkeletonBlock className="skeletonLine skeletonLabel" />
        <VerticalSpace space="extraSmall" />
        <SkeletonBlock className="skeletonDropdown" />
        <VerticalSpace space="small" />
        <div className="skeletonLinkRow">
          <SkeletonBlock className="skeletonLine skeletonLink" />
          <SkeletonBlock className="skeletonLine skeletonLink" />
        </div>
        <VerticalSpace space="small" />
        <div className="skeletonButtonPair">
          <SkeletonBlock className="skeletonButton" />
          <SkeletonBlock className="skeletonButton" />
        </div>
      </div>
      {includeFooterAction ? (
        <>
          <VerticalSpace space="small" />
          <SkeletonBlock className="skeletonButton skeletonFooterButton" />
        </>
      ) : null}
    </Container>
  );
}

export function FieldSkeleton() {
  return <SkeletonBlock className="skeletonDropdown" />;
}
