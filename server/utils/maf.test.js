import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clampMafOffset,
  mafBase,
  mafHeartRate,
  mafOffsetFromValue,
  validateMafHeartRate,
} from './maf.js';

describe('MAF heart rate', () => {
  it('uses 180 minus age, and allows up to +5', () => {
    assert.equal(mafBase(40), 140);
    assert.equal(mafHeartRate(40), 140);
    assert.equal(mafHeartRate(40, 5), 145);
    assert.equal(clampMafOffset(9), 5);
    assert.equal(mafOffsetFromValue(40, 145), 5);
  });

  it('drops 1 bpm when age goes up by 1, keeping the training bonus', () => {
    const offset = mafOffsetFromValue(40, 145);
    assert.equal(mafHeartRate(40, offset), 145);
    assert.equal(mafHeartRate(41, offset), 144);
  });

  it('rejects MAF outside the formula to +5 range', () => {
    assert.equal(validateMafHeartRate(40, 140), null);
    assert.equal(validateMafHeartRate(40, 145), null);
    assert.match(validateMafHeartRate(40, 146), /between 140 and 145/);
    assert.match(validateMafHeartRate(40, 139), /between 140 and 145/);
  });
});
