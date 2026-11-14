import React from 'react';
import { Button, LoadingButton, Modal, ModalBody, ModalFooter, ModalHeader, ModalTitle, ModalTransition, Text } from '@forge/react';
import { firstWord as firstName } from '../../lib/drafts';

// The only place a reply is sent from: the Send reply button calls onConfirm.
const SendConfirmModal = ({ match, sending, onCancel, onConfirm }) => (
  <ModalTransition>
    {match ? (
      <Modal onClose={sending ? undefined : onCancel}>
        <ModalHeader>
          <ModalTitle>Send reply</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <Text>{`Send this reply to ${firstName(match.customerName)}? It will be visible to the customer on ${match.requestKey}.`}</Text>
        </ModalBody>
        <ModalFooter>
          <Button appearance="subtle" onClick={onCancel} isDisabled={sending}>Cancel</Button>
          <LoadingButton appearance="primary" isLoading={sending} onClick={onConfirm}>Send reply</LoadingButton>
        </ModalFooter>
      </Modal>
    ) : null}
  </ModalTransition>
);

export default SendConfirmModal;
