import React from 'react';
import { Button, LoadingButton, Tooltip } from '@forge/react';

// "Refresh" with a refresh icon and a tooltip. While loading it switches to the spinner LoadingButton
// (LoadingButton has no icon props). No tooltip on a disabled button (UI Kit accessibility guidance).
const RefreshButton = ({ refreshing, isDisabled = false, onClick }) => {
  if (refreshing) return <LoadingButton isLoading>Refresh</LoadingButton>;
  const button = <Button iconBefore="refresh" isDisabled={isDisabled} onClick={onClick}>Refresh</Button>;
  return isDisabled ? button : <Tooltip content="Reload the latest data">{button}</Tooltip>;
};

export default RefreshButton;
