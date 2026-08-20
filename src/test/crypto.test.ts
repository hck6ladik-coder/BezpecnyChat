import { describe, it, expect } from 'vitest';
import {
  keccak256,
  keccak256Hex,
  computeKeccakTag,
  verifyKeccakIntegrity,
  deriveKeccakAddress,
  generateBlindMailboxToken,
} from '../crypto/keccak';
import { deriveMasterKey, deriveSubkeys, kdfRatchetStep, kdfRootStep } from '../crypto/kdf';
import { encryptAesGcm, decryptAesGcm, encryptJson, decryptJson } from '../crypto/aes';
import {
  generateUserPrekeys,
  createPublicPrekeyBundle,
  verifyPrekeyBundleSignature,
  x3dhInitiate,
  x3dhReceive,
} from '../crypto/x3dh';
import {
  initRatchetAsAlice,
  initRatchetAsBob,
  ratchetEncrypt,
  ratchetDecrypt,
} from '../crypto/ratchet';
import {
  createGroupSenderKey,
  processSenderKeyDistribution,
  groupEncrypt,
  groupDecrypt,
} from '../crypto/senderKey';
import { computeSafetyNumber, verifyScannedSafetyQr } from '../crypto/safetyNumbers';
import {
  formatSiweMessage,
  signSiweMessage,
  verifySiweSignature,
  generateTotpCode,
  verifyTotpCode,
  generateTotpSetup,
  verifyBackupCode,
} from '../crypto/auth';

describe('KECCAK-256 Cryptographic Primitives', () => {
  it('calculates KECCAK-256 hash correctly', () => {
    // Empty string Keccak-256 is c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470
    const emptyHash = keccak256Hex('');
    expect(emptyHash).toBe('c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470');

    // Known test vector: "hello"
    const helloHash = keccak256Hex('hello');
    expect(helloHash).toBe('1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8');
  });

  it('computes and verifies message integrity tag with KECCAK256', () => {
    const message = 'Přísně tajná E2EE zpráva';
    const tag = computeKeccakTag(message);
    expect(verifyKeccakIntegrity(message, tag)).toBe(true);
    expect(verifyKeccakIntegrity('Pozměněná zpráva', tag)).toBe(false);
  });

  it('derives privacy-preserving k256:0x address', () => {
    const dummyPubKey = new Uint8Array(32).fill(7);
    const address = deriveKeccakAddress(dummyPubKey);
    expect(address.startsWith('k256:0x')).toBe(true);
    expect(address.length).toBe(47);
  });

  it('generates blind mailbox token for zero-metadata routing', () => {
    const token = generateBlindMailboxToken('k256:0x1234567890abcdef', 'salt_epoch_1');
    expect(token).toBeDefined();
    expect(token.length).toBe(64);
  });
});

describe('Key Derivation Functions (KDF)', () => {
  it('derives master key from passphrase and salt', async () => {
    const { masterKey, saltHex } = await deriveMasterKey('silne-heslo-123456');
    expect(masterKey).toBeInstanceOf(Uint8Array);
    expect(masterKey.length).toBe(32);
    expect(saltHex).toBeDefined();

    const { vaultKey, authKey, backupKey } = deriveSubkeys(masterKey);
    expect(vaultKey.length).toBe(32);
    expect(authKey.length).toBe(32);
    expect(backupKey.length).toBe(32);
  });

  it('advances symmetric ratchet step correctly', () => {
    const chainKey = crypto.getRandomValues(new Uint8Array(32));
    const step1 = kdfRatchetStep(chainKey);
    const step2 = kdfRatchetStep(step1.nextChainKey);

    expect(step1.messageKey).not.toEqual(step2.messageKey);
    expect(step1.nextChainKey).not.toEqual(step2.nextChainKey);
  });
});

describe('AES-256-GCM Symmetric Encryption', () => {
  it('encrypts and decrypts binary and JSON data', async () => {
    const key = crypto.getRandomValues(new Uint8Array(32));
    const plaintext = 'Důvěrný text v češtině se speciálními znaky: Příliš žluťoučký kůň!';

    const { ciphertextWithTag, iv } = await encryptAesGcm(plaintext, key);
    const decrypted = await decryptAesGcm(ciphertextWithTag, key, iv);
    const decryptedText = new TextDecoder().decode(decrypted);

    expect(decryptedText).toBe(plaintext);

    // JSON roundtrip
    const payload = { id: 1, secret: 'top_secret', data: [1, 2, 3] };
    const encJson = await encryptJson(payload, key);
    const decJson = await decryptJson(encJson, key);
    expect(decJson).toEqual(payload);
  });
});

describe('X3DH Protocol & Extended Diffie-Hellman Handshake', () => {
  it('generates valid prekeys and verifies signed prekey signature', () => {
    const prekeys = generateUserPrekeys(10);
    const bundle = createPublicPrekeyBundle(prekeys);

    expect(bundle.identityKeyHex).toBe(prekeys.identityKeyPair.publicKeyHex);
    expect(verifyPrekeyBundleSignature(bundle, prekeys.signingKeyPair.publicKeyHex)).toBe(true);
  });

  it('completes symmetric X3DH handshake between Alice and Bob', () => {
    const alicePrekeys = generateUserPrekeys(10);
    const bobPrekeys = generateUserPrekeys(10);

    const bobOPK = Array.from(bobPrekeys.oneTimePrekeyPairs.keys())[0];
    const bobBundle = createPublicPrekeyBundle(bobPrekeys, bobOPK);

    // Alice initiates X3DH
    const aliceResult = x3dhInitiate(alicePrekeys.identityKeyPair, bobBundle);

    // Bob receives and completes X3DH
    const bobSharedSecret = x3dhReceive(
      bobPrekeys,
      alicePrekeys.identityKeyPair.publicKeyHex,
      aliceResult.ephemeralPublicKeyHex,
      aliceResult.oneTimePrekeyUsedHex
    );

    expect(aliceResult.sharedMasterKey.length).toBe(32);
    expect(bobSharedSecret.length).toBe(32);
  });
});

describe('Double Ratchet Protocol (E2EE with PFS & PCS)', () => {
  it('performs end-to-end messaging between Alice and Bob with ratchet advancement', async () => {
    const sharedSecret = crypto.getRandomValues(new Uint8Array(32));
    const bobPrekeys = generateUserPrekeys(10);

    // Alice and Bob initialize their ratchet states
    let aliceState = initRatchetAsAlice(sharedSecret, bobPrekeys.identityKeyPair.publicKey);
    let bobState = initRatchetAsBob(sharedSecret, bobPrekeys.identityKeyPair);

    // Alice -> Bob: Message 1
    const { newState: aliceState1, message: msg1 } = await ratchetEncrypt(
      aliceState,
      'Ahoj Bobe, toto je první šifrovaná zpráva!'
    );
    aliceState = aliceState1;

    const { newState: bobState1, plaintext: plain1 } = await ratchetDecrypt(bobState, msg1);
    bobState = bobState1;
    expect(plain1).toBe('Ahoj Bobe, toto je první šifrovaná zpráva!');

    // Alice -> Bob: Message 2 (Same sending chain)
    const { newState: aliceState2, message: msg2 } = await ratchetEncrypt(
      aliceState,
      'Druhá zpráva ve stejném řetězci.'
    );
    aliceState = aliceState2;

    const { newState: bobState2, plaintext: plain2 } = await ratchetDecrypt(bobState, msg2);
    bobState = bobState2;
    expect(plain2).toBe('Druhá zpráva ve stejném řetězci.');

    // Bob -> Alice: Message 3 (DH Ratchet step!)
    const { newState: bobState3, message: msg3 } = await ratchetEncrypt(
      bobState,
      'Ahoj Alice, potvrzuji příjem a provádím DH Ratchet krok!'
    );
    bobState = bobState3;

    const { newState: aliceState3, plaintext: plain3 } = await ratchetDecrypt(aliceState, msg3);
    aliceState = aliceState3;
    expect(plain3).toBe('Ahoj Alice, potvrzuji příjem a provádím DH Ratchet krok!');
  });
});

describe('Sender Key Protocol for Encrypted Groups', () => {
  it('creates sender key, distributes it, and allows group broadcast encryption', async () => {
    const groupId = 'group_crypto_devs';
    const aliceAddress = 'k256:0xalice0000000000000000000000000000000000';

    // Alice creates group sender key
    const { state: aliceSenderKey, distributionMessage } = createGroupSenderKey(
      groupId,
      aliceAddress
    );

    // Bob processes Alice's sender key distribution message
    let bobRecipientKey = processSenderKeyDistribution(distributionMessage);

    // Alice encrypts a group message
    const { newState: aliceSenderKey2, message: grpMsg } = await groupEncrypt(
      aliceSenderKey,
      'Vítejte v zabezpečené skupině s protokolem Sender Key!'
    );

    // Bob decrypts the group message
    const { newState: bobRecipientKey2, plaintext } = await groupDecrypt(
      bobRecipientKey,
      grpMsg
    );

    expect(plaintext).toBe('Vítejte v zabezpečené skupině s protokolem Sender Key!');
    expect(aliceSenderKey2.iteration).toBe(1);
    expect(bobRecipientKey2.iteration).toBe(1);
  });
});

describe('Safety Numbers & Identity Verification', () => {
  it('computes identical safety numbers symmetrically between Alice and Bob', () => {
    const aliceIK = '11'.repeat(32);
    const bobIK = '22'.repeat(32);
    const aliceAddr = 'k256:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const bobAddr = 'k256:0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

    const numAliceView = computeSafetyNumber(aliceIK, bobIK, aliceAddr, bobAddr);
    const numBobView = computeSafetyNumber(bobIK, aliceIK, bobAddr, aliceAddr);

    expect(numAliceView.fingerprint).toBe(numBobView.fingerprint);
    expect(numAliceView.formattedBlocks).toEqual(numBobView.formattedBlocks);
    expect(numAliceView.shortVerificationCode).toBe(numBobView.shortVerificationCode);
    expect(verifyScannedSafetyQr(numAliceView.qrPayload, numBobView)).toBe(true);
  });
});

describe('Authentication, SIWE & 2FA TOTP', () => {
  it('signs and verifies SIWE message format', () => {
    const keyPair = generateUserPrekeys(1).signingKeyPair;
    const siweData = {
      domain: 'localhost',
      address: 'k256:0x1234567890abcdef1234567890abcdef12345678',
      statement: 'Ověření přihlášení',
      uri: 'http://localhost:5174',
      version: '1',
      chainId: 1,
      nonce: '12345678',
      issuedAt: new Date().toISOString(),
    };

    const formatted = formatSiweMessage(siweData);
    const { signatureHex } = signSiweMessage(formatted, keyPair.privateKey);
    const isValid = verifySiweSignature(formatted, signatureHex, keyPair.publicKeyHex);

    expect(isValid).toBe(true);
  });

  it('generates and verifies TOTP codes and backup codes', async () => {
    const totpSetup = generateTotpSetup('Alice');
    const secretBytes = new Uint8Array(20).fill(9);

    const code = await generateTotpCode(secretBytes);
    const isValid = await verifyTotpCode(secretBytes, code);
    expect(isValid).toBe(true);

    // Verify invalid code fails
    const isInvalid = await verifyTotpCode(secretBytes, '999999');
    expect(isInvalid).toBe(false);

    // Backup code verification
    const backupCode = totpSetup.backupCodes[0];
    const { isValid: isBackupValid, remainingHashes } = verifyBackupCode(
      backupCode,
      totpSetup.backupCodeHashes
    );
    expect(isBackupValid).toBe(true);
    expect(remainingHashes.length).toBe(totpSetup.backupCodeHashes.length - 1);
  });
});
