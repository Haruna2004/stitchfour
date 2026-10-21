// Board positions used by the captures (moves are columns, red starts).
export const POS = {
  /** calm mid-game, red to move */
  idle: '3,3,2,4,4,2,3,5,1,3',
  /** red plays horizWin to finish four along the bottom (cols 1-4) */
  horiz: '3,3,4,5,2,2,4,4',
  horizWin: 1,
  /** red plays diagWin to finish a rising diagonal (3,0)-(6,3) */
  diag: '3,4,4,5,5,6,5,6,6,0,2,1',
  diagWin: 6,
  /** a light opening for the drop clip */
  drop: '3,3,2,4',
}
