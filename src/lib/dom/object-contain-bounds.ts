export interface ObjectContainContentBounds {
  height: number;
  left: number;
  top: number;
  width: number;
}

export interface NaturalMediaSize {
  height: number;
  width: number;
}

/** Pixel rect of the visible media content inside an `object-contain` box. */
export function computeObjectContainContentBounds(
  containerWidth: number,
  containerHeight: number,
  naturalSize: NaturalMediaSize
): ObjectContainContentBounds {
  if (containerWidth <= 0 || containerHeight <= 0) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }

  if (naturalSize.width <= 0 || naturalSize.height <= 0) {
    return {
      left: 0,
      top: 0,
      width: containerWidth,
      height: containerHeight,
    };
  }

  const scale = Math.min(
    containerWidth / naturalSize.width,
    containerHeight / naturalSize.height
  );
  const width = naturalSize.width * scale;
  const height = naturalSize.height * scale;

  return {
    left: (containerWidth - width) / 2,
    top: (containerHeight - height) / 2,
    width,
    height,
  };
}

export function measureObjectContainContentBounds(
  element: HTMLElement,
  naturalSize: NaturalMediaSize
): ObjectContainContentBounds {
  return computeObjectContainContentBounds(
    element.clientWidth,
    element.clientHeight,
    naturalSize
  );
}
