import { S, STORAGE_SOFT_LIMIT, STORAGE_HARD_LIMIT } from './state.js';
import { exportProject } from './export.js';

function updateBadge(bytes) {
  $('#btn-export-project')
    .toggleClass('storage-warn', bytes >= STORAGE_SOFT_LIMIT && bytes < STORAGE_HARD_LIMIT)
    .toggleClass('storage-full', bytes >= STORAGE_HARD_LIMIT)
    .attr('title', bytes >= STORAGE_HARD_LIMIT
      ? 'Auto-save FULL — save your project to a file!'
      : bytes >= STORAGE_SOFT_LIMIT
        ? 'Auto-save limited — some tab images not saved (project too large)'
        : 'Save project as .arcalc');
}

function showHardLimitDialog() {
  if (S.hardLimitDialogShown) return;
  S.hardLimitDialogShown = true;
  $('<div class="storage-modal-overlay">')
    .append(
      $('<div class="storage-modal">')
        .append('<p><strong>Auto-save is full.</strong><br>Your work is no longer being saved to this browser — the images are too large for local storage.</p>')
        .append(
          $('<button class="btn-primary">').text('Save Project File').on('click', function() {
            exportProject();
            $(this).closest('.storage-modal-overlay').remove();
          })
        )
        .append(
          $('<button>').text('Dismiss').on('click', function() {
            $(this).closest('.storage-modal-overlay').remove();
          })
        )
    )
    .appendTo('body');
}

// storage.js fires this event after every save attempt
$(document).on('storage:update', function(e, bytes) {
  updateBadge(bytes);
  if (bytes >= STORAGE_HARD_LIMIT) showHardLimitDialog();
});
