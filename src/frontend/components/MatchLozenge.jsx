import React from 'react';
import { Lozenge } from '@forge/react';
import { percent } from './format';

// "Linked" (green) or "Likely 29%" (blue); `long` gives "Linked to LOOP-1" / "Likely match 29%".
const MatchLozenge = ({ match, long }) =>
  match.linked ? (
    <Lozenge appearance="success">{long ? `Linked to ${match.bugKey}` : 'Linked'}</Lozenge>
  ) : (
    <Lozenge appearance="inprogress">{`${long ? 'Likely match' : 'Likely'} ${percent(match.score)}`}</Lozenge>
  );

export default MatchLozenge;
