import { newCommand } from './CommandImpl';
import { newPath } from './PathImpl';
import { Command, Path, SvgChar } from '.';
import { MathUtil, Point, Matrix } from '../common';

/**
 * Interpolates between a start and end path using the specified fraction.
 *
 * TODO: make it possible to create 'stateless' paths (to save memory on animation frames).
 */
export function interpolate(start: Path, end: Path, fraction: number) {
  if (!start.isMorphableWith(end)) {
    throw new Error('Attempt to interpolate two unmorphable paths');
  }
  const newCommands: Command[] = [];
  start.getCommands().forEach((startCmd, i) => {
    const endCmd = end.getCommands()[i];
    const points: Point[] = [];
    for (let j = 0; j < startCmd.getPoints().length; j++) {
      const p1 = startCmd.getPoints()[j];
      const p2 = endCmd.getPoints()[j];
      if (p1 && p2) {
        // The 'start' point of the first Move command in a path
        // will be undefined. Skip it.
        const px = MathUtil.lerp(p1.x, p2.x, fraction);
        const py = MathUtil.lerp(p1.y, p2.y, fraction);
        points.push(new Point(px, py));
      } else {
        points.push(undefined);
      }
    }
    // TODO: avoid re-generating unique ids on each animation frame.
    newCommands.push(newCommand(startCmd.getSvgChar(), points));
  });
  return newPath(newCommands);
}

/**
 * Sorts a list of path ops in descending order.
 */
export function sortPathOps(ops: Array<{ subIdx: number, cmdIdx: number }>) {
  return ops.sort(
    ({ subIdx: s1, cmdIdx: c1 }, { subIdx: s2, cmdIdx: c2 }) => {
      // Perform higher index splits first so that we don't alter the
      // indices of the lower index split operations.
      return s1 !== s2 ? s2 - s1 : c2 - c1;
    });
}

type PathOp = 'RV' | 'SB' | 'SF' | 'S' | 'SIH' | 'US' | 'CV' | 'UCV' | 'RT' | 'M'
  | 'AC' | 'DC' | 'SSSP' | 'SFSP' | 'DFSP' | 'DSPSS' | 'DSSSP' | 'USFSP' | 'T';

export function fromPathOpString(pathString: string, pathOpsString: string) {
  const A = pathOpsString.split(' ');
  const mutator = newPath(pathString).mutate();
  for (let i = 0; i < A.length; i++) {
    const op = A[i] as PathOp;
    switch (op) {
      case 'RV': // Reverse.
        mutator.reverseSubPath(+A[i + 1]);
        i += 1;
        break;
      case 'SB': // Shift back.
        mutator.shiftSubPathBack(+A[i + 1]);
        i += 1;
        break;
      case 'SF': // Shift forward.
        mutator.shiftSubPathForward(+A[i + 1]);
        i += 1;
        break;
      case 'S': // Split.
        const subIdx = +A[i + 1];
        const cmdIdx = +A[i + 2];
        const args = [+A[i + 3]];
        i += 3;
        while (!isNaN(+A[i + 1]) && i < A.length) {
          args.push(+A[i + 1]);
          i++;
        }
        mutator.splitCommand(subIdx, cmdIdx, ...args);
        break;
      case 'SIH': // Split in half.
        mutator.splitCommandInHalf(+A[i + 1], +A[i + 2]);
        i += 2;
        break;
      case 'US': // Unsplit.
        mutator.unsplitCommand(+A[i + 1], +A[i + 2]);
        i += 2;
        break;
      case 'CV': // Convert.
        mutator.convertCommand(+A[i + 1], +A[i + 2], A[i + 3] as SvgChar);
        i += 3;
        break;
      case 'UCV': // Unconvert.
        mutator.unconvertSubPath(+A[i + 1]);
        i += 1;
        break;
      case 'RT': // Revert.
        mutator.revert();
        break;
      case 'M': // Move subpath.
        mutator.moveSubPath(+A[i + 1], +A[i + 2]);
        i += 2;
        break;
      case 'AC': // Add collapsing sub path.
        mutator.addCollapsingSubPath(new Point(+A[i + 1], +A[i + 2]), +A[i + 3]);
        i += 3;
        break;
      case 'DC': // Delete collapsing sub paths.
        mutator.deleteCollapsingSubPaths();
        break;
      case 'SSSP': // Split stroked sub path.
        mutator.splitStrokedSubPath(+A[i + 1], +A[i + 2]);
        i += 2;
        break;
      case 'SFSP': // Split filled sub path.
        mutator.splitFilledSubPath(+A[i + 1], +A[i + 2], +A[i + 3]);
        i += 3;
        break;
      case 'DFSP': // Delete filled sub path.
        mutator.deleteFilledSubPath(+A[i + 1]);
        i += 1;
        break;
      case 'DSPSS': // Delete sub path split segment.
        mutator.deleteSubPathSplitSegment(+A[i + 1], +A[i + 2]);
        i += 2;
        break;
      case 'DSSSP': // Unsplit stroked sub path.
        mutator.deleteStrokedSubPath(+A[i + 1]);
        i += 1;
        break;
      case 'USFSP': // Unsplit stroked sub path.
        mutator.deleteStrokedSubPath(+A[i + 1]);
        i += 1;
        break;
      case 'T': // Transform.
        const isTransformOpFn = (token: string) => {
          token = (token || '').toLowerCase();
          return new Set(['scale', 'rotate', 'translate']).has(token);
        };
        while (isTransformOpFn(A[i + 1])) {
          const transformOp = A[i + 1];
          let matrix: Matrix;
          switch (transformOp) {
            case 'scale':
              matrix = Matrix.fromScaling(+A[i + 2], +A[i + 3]);
              i += 3;
              break;
            case 'rotate':
              matrix = Matrix.fromRotation(+A[i + 2]);
              i += 2;
              break;
            case 'translate':
              matrix = Matrix.fromTranslation(+A[i + 2], +A[i + 3]);
              i += 3;
              break;
            default:
              throw new Error('Invalid transform op: ' + transformOp);
          }
          mutator.addTransforms([matrix]);
        }
        break;
      default:
        throw new Error('Invalid path op: ' + op);
    }
  }
  return mutator.build();
}
