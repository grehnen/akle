import { editTitle, MAX_ITINERARY_TITLE, titleLength } from "../freePlay/itineraryLink";

export function TitleField({
  title,
  onChange,
}: {
  title: string;
  onChange: (title: string) => void;
}) {
  return (
    <div className="itinerary-title">
      <label htmlFor="itinerary-title">Namn (valfritt)</label>
      {/* Capped on change rather than by maxLength, which counts an emoji as two. */}
      <input
        id="itinerary-title"
        value={title}
        autoComplete="off"
        aria-describedby="itinerary-title-count"
        onChange={(event) => {
          const field = event.target;
          const edited = editTitle(title, field.value, field.selectionStart ?? undefined);
          // Set here, so React finds the value already right and leaves the caret alone.
          if (edited.title !== field.value) {
            field.value = edited.title;
            field.setSelectionRange(edited.caret, edited.caret);
          }
          onChange(edited.title);
        }}
      />
      <span id="itinerary-title-count" className="itinerary-title-count">
        {titleLength(title)}/{MAX_ITINERARY_TITLE}
        <span className="visually-hidden"> tecken</span>
      </span>
    </div>
  );
}
