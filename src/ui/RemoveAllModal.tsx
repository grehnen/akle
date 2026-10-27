import { Modal } from "./Modal";

/** Asks to confirm removing every trip of the itinerary, whose name is kept. */
export function RemoveAllModal({
  tripCount,
  title,
  onCancel,
  onConfirm,
}: {
  tripCount: number;
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      label="Ta bort alla resor"
      className="remove-all-modal"
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="remove-all-cancel" onClick={onCancel}>
            Avbryt
          </button>
          <button type="button" className="remove-all-confirm" onClick={onConfirm}>
            Ta bort alla resor
          </button>
        </>
      }
    >
      <h2 className="remove-all-heading">
        Ta bort {tripCount === 1 ? "resan" : `alla ${tripCount} resor`}?
      </h2>
      <p className="remove-all-text">
        Namnet {title === "" ? "(inget än)" : `”${title}”`} behålls.
      </p>
    </Modal>
  );
}
