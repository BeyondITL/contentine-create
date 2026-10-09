/**
 * Contentine Create — GENERATED model artifact manifest. DO NOT EDIT BY HAND.
 * Regenerate with:  node scripts/build-model-manifest.mjs   (repo root)
 *
 * Every artifact of every self-downloaded model (kokoro-js / transformersjs
 * engines), with pinned revision, expected byte size, and SHA-256. LFS hashes
 * come from HuggingFace's authoritative LFS records; small non-LFS files are
 * hashed by the builder. WebLLM models are engine-cache-owned and are NOT
 * listed here (browser-storage-only, see model-storage.ts).
 */

export interface ModelArtifact {
  /** Repo-relative path, e.g. 'onnx/model_quantized.onnx'. */
  path: string;
  sizeBytes: number;
  /** Lowercase hex SHA-256 of the exact bytes. */
  sha256: string;
}

export interface ModelArtifactSet {
  repo: string;
  /** Pinned repo revision (main at manifest build time). */
  revision: string;
  artifacts: ModelArtifact[];
}

export const MODEL_ARTIFACTS: Record<string, ModelArtifactSet> = {
  "kokoro-82m": {
    "repo": "onnx-community/Kokoro-82M-v1.0-ONNX",
    "revision": "1939ad2a8e416c0acfeecc08a694d14ef25f2231",
    "artifacts": [
      {
        "path": "config.json",
        "sizeBytes": 44,
        "sha256": "df34b4f930b23447cd4dc410fabfb42eb3f24e803e6c3f97d618fb359380a36f"
      },
      {
        "path": "onnx/model_quantized.onnx",
        "sizeBytes": 92361116,
        "sha256": "fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478"
      },
      {
        "path": "tokenizer.json",
        "sizeBytes": 3497,
        "sha256": "77a02c8e164413299b4b4c403b14f8e0e1c1b727db4d46a09d6327b861060a34"
      },
      {
        "path": "tokenizer_config.json",
        "sizeBytes": 113,
        "sha256": "be1cb066d6ef6b074b3f15e6a6dd21ac88ff3cdaedf325f0aaed686c70f75d20"
      },
      {
        "path": "voices/af.bin",
        "sizeBytes": 524288,
        "sha256": "a4f11d9d055a12bfa0db2668a3e4f0ef8fd1f1ccca69494479718e44dbf9e41a"
      },
      {
        "path": "voices/af_alloy.bin",
        "sizeBytes": 522240,
        "sha256": "c4a6b876047fd7fb472edf4ebd63cfac7c3b958a7cae7c106e8f038ca6308c45"
      },
      {
        "path": "voices/af_aoede.bin",
        "sizeBytes": 522240,
        "sha256": "4a004c33430762e2461eedb2013fad808ef4ab3121f5300f554476caf58d8361"
      },
      {
        "path": "voices/af_bella.bin",
        "sizeBytes": 522240,
        "sha256": "f69d836209b78eb8c66e75e3cda491e26ea838a3674257e9d4e5703cbaf55c8b"
      },
      {
        "path": "voices/af_heart.bin",
        "sizeBytes": 522240,
        "sha256": "d583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b"
      },
      {
        "path": "voices/af_jessica.bin",
        "sizeBytes": 522240,
        "sha256": "a240a5e3c15b43563d6e923bdca8ef5613a23471d9b77653694012435df23bd8"
      },
      {
        "path": "voices/af_kore.bin",
        "sizeBytes": 522240,
        "sha256": "9be5221b6a941c04b561959b8ff0b06e809444dcc4ab7e75a7b23606f691819e"
      },
      {
        "path": "voices/af_nicole.bin",
        "sizeBytes": 522240,
        "sha256": "cd2191ab31b914ed7b318416b0e4440fdf392ddad9106a060819aa600a64f59a"
      },
      {
        "path": "voices/af_nova.bin",
        "sizeBytes": 522240,
        "sha256": "18778272caa0d0eebaea251c35fd635f038434f9eee5e691d02a174bd328414f"
      },
      {
        "path": "voices/af_river.bin",
        "sizeBytes": 522240,
        "sha256": "00a2bcf82b1d86e8f19902ede58c65ccf6c0e43b44b7d74fad54e5d8933c9c30"
      },
      {
        "path": "voices/af_sarah.bin",
        "sizeBytes": 522240,
        "sha256": "4409fbc125afabacc615d94db5398d847006a737b0247d6892b7a9a0007a2f0a"
      },
      {
        "path": "voices/af_sky.bin",
        "sizeBytes": 522240,
        "sha256": "4435255c9744f3f31659e0d714ab7689bf65d9e77ec1cce060f083912614f0b9"
      },
      {
        "path": "voices/am_adam.bin",
        "sizeBytes": 522240,
        "sha256": "162b035ed91cfc48b6046982184c645f72edcdd1b82843347f605d7bf7b15716"
      },
      {
        "path": "voices/am_echo.bin",
        "sizeBytes": 522240,
        "sha256": "3968b92c3c4cd1c4416dbded36c13eaa388a90d5788d02a13e4d781f5f8cf3c3"
      },
      {
        "path": "voices/am_eric.bin",
        "sizeBytes": 522240,
        "sha256": "e8b5be17edd1e3636901ce7598baafe2dc8dd8ff707a0c23bf9e461add7e2832"
      },
      {
        "path": "voices/am_fenrir.bin",
        "sizeBytes": 522240,
        "sha256": "c27989f741f7ee34d273a39d8a595cc0837d35f5ced9a29b7cc162614616df43"
      },
      {
        "path": "voices/am_liam.bin",
        "sizeBytes": 522240,
        "sha256": "52403be32fd047c6a44517cb0bcd6b134f2a18baa73e70ef41651e0eab921ade"
      },
      {
        "path": "voices/am_michael.bin",
        "sizeBytes": 522240,
        "sha256": "1d1f21dd8da39c30705cd4c75d039d265e9bc4a2a93ed09bc9e1b1225eb95ba1"
      },
      {
        "path": "voices/am_onyx.bin",
        "sizeBytes": 522240,
        "sha256": "da5d135b424164916d75a68ffb4c2abce3d7d5ccc82dd1ee6cf447ce286145e6"
      },
      {
        "path": "voices/am_puck.bin",
        "sizeBytes": 522240,
        "sha256": "fcf73c989033e9233e0b98713eca600c8c74dcc1614b37009d5450ff4a2274a0"
      },
      {
        "path": "voices/am_santa.bin",
        "sizeBytes": 522240,
        "sha256": "61150cf726ab6c5ed7a99f90a304f91f5a72c00c592e89ec94e5df11c319227a"
      },
      {
        "path": "voices/bf_alice.bin",
        "sizeBytes": 522240,
        "sha256": "08afa6ba24da61ea5e8efa139e5aadc938d83f0a6da5a900adaf763ac1da5573"
      },
      {
        "path": "voices/bf_emma.bin",
        "sizeBytes": 522240,
        "sha256": "669fe0647f9dd04fcab92f1439a40eeb4c8b4ab1f82e4996fe3d918ce4a63b73"
      },
      {
        "path": "voices/bf_isabella.bin",
        "sizeBytes": 522240,
        "sha256": "3754352c4aaa46d17f27654ab7518d65b62ad6163a0f55a5f4330c2da2c4e94f"
      },
      {
        "path": "voices/bf_lily.bin",
        "sizeBytes": 522240,
        "sha256": "5e0ee32ebe64a467124976b14e69590746f1c4ce41a12b587a50c862edfea335"
      },
      {
        "path": "voices/bm_daniel.bin",
        "sizeBytes": 522240,
        "sha256": "6b3194bbceffb746733cbc22c8f593dd44e401a71d53895a2dca891bc595a1e8"
      },
      {
        "path": "voices/bm_fable.bin",
        "sizeBytes": 522240,
        "sha256": "f889083196807b4adb15e9204252165f503b8d33d3982e681c52443c49d798f1"
      },
      {
        "path": "voices/bm_george.bin",
        "sizeBytes": 522240,
        "sha256": "c4b235a4c1f2cd3b939fed08b899ce9385638b763f7b73a59616c4fc9bd6c9bc"
      },
      {
        "path": "voices/bm_lewis.bin",
        "sizeBytes": 522240,
        "sha256": "b8f671cef828c30e66fdf0b0756a76bba58f6bb3398cbbf27058642acbcedb97"
      },
      {
        "path": "voices/ef_dora.bin",
        "sizeBytes": 522240,
        "sha256": "f66ec66bd295acb18372e37008533a9a3228483ccd294e7538d5d9294ac9a532"
      },
      {
        "path": "voices/em_alex.bin",
        "sizeBytes": 522240,
        "sha256": "27809e9eafdcbcfff90a3016c697568676531de2a2c39cee29c96c7bd6b83e95"
      },
      {
        "path": "voices/em_santa.bin",
        "sizeBytes": 522240,
        "sha256": "ad43b774e1ca24d05c6161297d8aeb770ac3d29bb95daf516727af5f7d543683"
      },
      {
        "path": "voices/ff_siwis.bin",
        "sizeBytes": 522240,
        "sha256": "a35f5675ad08948e326ae75fd0ea16ba5d0042e4f76b5f3d1df77d0a48c54861"
      },
      {
        "path": "voices/hf_alpha.bin",
        "sizeBytes": 522240,
        "sha256": "040be6a4425411cc01fda5fd06693c76bfa78572632852bc8cda9c99232ffb56"
      },
      {
        "path": "voices/hf_beta.bin",
        "sizeBytes": 522240,
        "sha256": "cd83ae0bb9b2e4e4fb92b4973bd8d1822ca0036d3c498bf4fc89aa8e33917cc7"
      },
      {
        "path": "voices/hm_omega.bin",
        "sizeBytes": 522240,
        "sha256": "b02d9222d9ed00ce26b302173a862c2c93f96cc40b5c422b8d14910b9ff34137"
      },
      {
        "path": "voices/hm_psi.bin",
        "sizeBytes": 522240,
        "sha256": "644daf88ba8aeb7bd08950bbdcd4453bb280864e49dc4df93fabc6be32e03f37"
      },
      {
        "path": "voices/if_sara.bin",
        "sizeBytes": 522240,
        "sha256": "409b69248798fcdc2542330c76953d230710f19b057e59cb82fdc3c4cf71265c"
      },
      {
        "path": "voices/im_nicola.bin",
        "sizeBytes": 522240,
        "sha256": "bc578e510d52a96d6940d46f12e96d7b3df00905dbea075113226d100e6e1ab0"
      },
      {
        "path": "voices/jf_alpha.bin",
        "sizeBytes": 522240,
        "sha256": "56b479360aad9f367aeb8cef908f9201cf48b4555e488c5f4590c9dfcd978bb6"
      },
      {
        "path": "voices/jf_gongitsune.bin",
        "sizeBytes": 522240,
        "sha256": "0f1181f3772d27b7c12aaf4bcd71e31b186c4146e330d074a3dc64ee392af396"
      },
      {
        "path": "voices/jf_nezumi.bin",
        "sizeBytes": 522240,
        "sha256": "13cb71eebb0b48739d444558322aa35a8c9a489b80e1e631f14d2e6aea93026b"
      },
      {
        "path": "voices/jf_tebukuro.bin",
        "sizeBytes": 522240,
        "sha256": "29c6c0561b4288d59639677bebe7533c919743d5ea68d0d2ae992644beea6696"
      },
      {
        "path": "voices/jm_kumo.bin",
        "sizeBytes": 522240,
        "sha256": "09e959d239724c734d65661f06f14cdabcddfd476bfaaad905a937099ae9e64f"
      },
      {
        "path": "voices/pf_dora.bin",
        "sizeBytes": 522240,
        "sha256": "3da7b5b2d91847ebf5646f57631af6ececae3c29a89cd300f06edf9aa6cfe9ee"
      },
      {
        "path": "voices/pm_alex.bin",
        "sizeBytes": 522240,
        "sha256": "0175c753f59c54e7fd5a995bedef0c5ff2fb67e0043dd3dcb2ae74ec2acbeb2a"
      },
      {
        "path": "voices/pm_santa.bin",
        "sizeBytes": 522240,
        "sha256": "8b012db3185778afe2e45a62cbad69db73021774fe68dda634bcc748a982eede"
      },
      {
        "path": "voices/zf_xiaobei.bin",
        "sizeBytes": 522240,
        "sha256": "5dde6e1c9c4f12c8b327bc29c0cee361a23b52b952c04636858ba637ec66e640"
      },
      {
        "path": "voices/zf_xiaoni.bin",
        "sizeBytes": 522240,
        "sha256": "08892b62a39af0a615cd0581238db7e19e44c578e8fa0bfd0e586e93327d9cba"
      },
      {
        "path": "voices/zf_xiaoxiao.bin",
        "sizeBytes": 522240,
        "sha256": "03adb5d5e3ddd88b047954e974e651cb0a4b524c985057e5d872e962c7be1169"
      },
      {
        "path": "voices/zf_xiaoyi.bin",
        "sizeBytes": 522240,
        "sha256": "bc1555c5c486099196ac254bae5e0bb543c121952a3092f50b7d8724f1bc36b3"
      },
      {
        "path": "voices/zm_yunjian.bin",
        "sizeBytes": 522240,
        "sha256": "de48a00bdbf3649f07162269a2b6e0513604389bfac8a2e6c75cb34b323ad6fa"
      },
      {
        "path": "voices/zm_yunxi.bin",
        "sizeBytes": 522240,
        "sha256": "7243892fb4e560d47014090ddf010f8b8b790f3c6b029ff82b2ac06aa4e27c8b"
      },
      {
        "path": "voices/zm_yunxia.bin",
        "sizeBytes": 522240,
        "sha256": "6b2b8fc15b3df19a368daebe5c581c7fabf433ee5b8a17ffd6b3d723cff8936d"
      },
      {
        "path": "voices/zm_yunyang.bin",
        "sizeBytes": 522240,
        "sha256": "261e2c89470534dbbcb8fd98b8fdc495ec94063d9bb6c8277f7be43cccba3f42"
      }
    ]
  },
  "whisper-tiny": {
    "repo": "Xenova/whisper-tiny",
    "revision": "5332fcc35e32a33b86612b9a57a89be7906102b1",
    "artifacts": [
      {
        "path": "config.json",
        "sizeBytes": 2248,
        "sha256": "2b2e4e519084e0ea028b19b153f95202735a971870d6844aa26e559edd292e94"
      },
      {
        "path": "generation_config.json",
        "sizeBytes": 3716,
        "sha256": "68ac791fcb4999461a313472125042934656240ba1cba7d1c2627fcbb19ac24c"
      },
      {
        "path": "onnx/decoder_model_merged_quantized.onnx",
        "sizeBytes": 30727765,
        "sha256": "6c0c125986b007d2e3734bec84c18bda0152071b90b87fadac6d7764499927a0"
      },
      {
        "path": "onnx/encoder_model_quantized.onnx",
        "sizeBytes": 10124910,
        "sha256": "fd9d995b9dcb0520f0dbf6cf68651af639fc385f594d9d876e69ca2802dc438e"
      },
      {
        "path": "preprocessor_config.json",
        "sizeBytes": 339,
        "sha256": "a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d"
      },
      {
        "path": "tokenizer.json",
        "sizeBytes": 2480466,
        "sha256": "27fc476bfe7f17299480be2273fc0608e4d5a99aba2ab5dec5374b4482d1a566"
      },
      {
        "path": "tokenizer_config.json",
        "sizeBytes": 282683,
        "sha256": "2a4c4281cf9f51ac6ccc406fdc711a087afe6530f671fa7b80953edc498275ce"
      }
    ]
  },
  "whisper-base": {
    "repo": "onnx-community/whisper-base",
    "revision": "1846881b6b3a3024392c1eea3ad983695bc23925",
    "artifacts": [
      {
        "path": "config.json",
        "sizeBytes": 2243,
        "sha256": "f4d0608f7d918166da7edb3e188de5ef1bfe70d9802e785d271fd88111e9cf4b"
      },
      {
        "path": "generation_config.json",
        "sizeBytes": 3832,
        "sha256": "61070cf8de25b1e9256e8e102ded49d8d24a8369ed36ef84fdf21549e68125a0"
      },
      {
        "path": "onnx/decoder_model_merged_quantized.onnx",
        "sizeBytes": 53693315,
        "sha256": "fa3ef9902734ce5ae6f9ef2bdb2ba9a6c4b5785b09f4f420ce036573dc9d090b"
      },
      {
        "path": "onnx/encoder_model_quantized.onnx",
        "sizeBytes": 23201314,
        "sha256": "5862993336bf33acd23736071aae2b32261d3b1b2f37780194460d4ef974dd46"
      },
      {
        "path": "preprocessor_config.json",
        "sizeBytes": 339,
        "sha256": "a6a76d28c93edb273669eb9e0b0636a2bddbb1272c3261e47b7ca6dfdbac1b8d"
      },
      {
        "path": "tokenizer.json",
        "sizeBytes": 2480466,
        "sha256": "27fc476bfe7f17299480be2273fc0608e4d5a99aba2ab5dec5374b4482d1a566"
      },
      {
        "path": "tokenizer_config.json",
        "sizeBytes": 282682,
        "sha256": "2e036e4dbacfdeb7242c7d4ec4149f4a16e86026048f94d1637e3a8ee9c6a573"
      }
    ]
  },
  "kokoro-82m-timestamped": {
    "repo": "onnx-community/Kokoro-82M-v1.0-ONNX-timestamped",
    "revision": "dd4401a9add81ac692d20e240d22ec9dda82cc29",
    "artifacts": [
      {
        "path": "config.json",
        "sizeBytes": 44,
        "sha256": "df34b4f930b23447cd4dc410fabfb42eb3f24e803e6c3f97d618fb359380a36f"
      },
      {
        "path": "onnx/model_quantized.onnx",
        "sizeBytes": 92361055,
        "sha256": "c0c02b3299fd97c34ea92a98e6d41eaa1a739c8f77bf685aac34bd7b34c1132c"
      },
      {
        "path": "tokenizer.json",
        "sizeBytes": 3497,
        "sha256": "77a02c8e164413299b4b4c403b14f8e0e1c1b727db4d46a09d6327b861060a34"
      },
      {
        "path": "tokenizer_config.json",
        "sizeBytes": 113,
        "sha256": "be1cb066d6ef6b074b3f15e6a6dd21ac88ff3cdaedf325f0aaed686c70f75d20"
      },
      {
        "path": "voices/af.bin",
        "sizeBytes": 524288,
        "sha256": "a4f11d9d055a12bfa0db2668a3e4f0ef8fd1f1ccca69494479718e44dbf9e41a"
      },
      {
        "path": "voices/af_alloy.bin",
        "sizeBytes": 522240,
        "sha256": "c4a6b876047fd7fb472edf4ebd63cfac7c3b958a7cae7c106e8f038ca6308c45"
      },
      {
        "path": "voices/af_aoede.bin",
        "sizeBytes": 522240,
        "sha256": "4a004c33430762e2461eedb2013fad808ef4ab3121f5300f554476caf58d8361"
      },
      {
        "path": "voices/af_bella.bin",
        "sizeBytes": 522240,
        "sha256": "f69d836209b78eb8c66e75e3cda491e26ea838a3674257e9d4e5703cbaf55c8b"
      },
      {
        "path": "voices/af_heart.bin",
        "sizeBytes": 522240,
        "sha256": "d583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b"
      },
      {
        "path": "voices/af_jessica.bin",
        "sizeBytes": 522240,
        "sha256": "a240a5e3c15b43563d6e923bdca8ef5613a23471d9b77653694012435df23bd8"
      },
      {
        "path": "voices/af_kore.bin",
        "sizeBytes": 522240,
        "sha256": "9be5221b6a941c04b561959b8ff0b06e809444dcc4ab7e75a7b23606f691819e"
      },
      {
        "path": "voices/af_nicole.bin",
        "sizeBytes": 522240,
        "sha256": "cd2191ab31b914ed7b318416b0e4440fdf392ddad9106a060819aa600a64f59a"
      },
      {
        "path": "voices/af_nova.bin",
        "sizeBytes": 522240,
        "sha256": "18778272caa0d0eebaea251c35fd635f038434f9eee5e691d02a174bd328414f"
      },
      {
        "path": "voices/af_river.bin",
        "sizeBytes": 522240,
        "sha256": "00a2bcf82b1d86e8f19902ede58c65ccf6c0e43b44b7d74fad54e5d8933c9c30"
      },
      {
        "path": "voices/af_sarah.bin",
        "sizeBytes": 522240,
        "sha256": "4409fbc125afabacc615d94db5398d847006a737b0247d6892b7a9a0007a2f0a"
      },
      {
        "path": "voices/af_sky.bin",
        "sizeBytes": 522240,
        "sha256": "4435255c9744f3f31659e0d714ab7689bf65d9e77ec1cce060f083912614f0b9"
      },
      {
        "path": "voices/am_adam.bin",
        "sizeBytes": 522240,
        "sha256": "162b035ed91cfc48b6046982184c645f72edcdd1b82843347f605d7bf7b15716"
      },
      {
        "path": "voices/am_echo.bin",
        "sizeBytes": 522240,
        "sha256": "3968b92c3c4cd1c4416dbded36c13eaa388a90d5788d02a13e4d781f5f8cf3c3"
      },
      {
        "path": "voices/am_eric.bin",
        "sizeBytes": 522240,
        "sha256": "e8b5be17edd1e3636901ce7598baafe2dc8dd8ff707a0c23bf9e461add7e2832"
      },
      {
        "path": "voices/am_fenrir.bin",
        "sizeBytes": 522240,
        "sha256": "c27989f741f7ee34d273a39d8a595cc0837d35f5ced9a29b7cc162614616df43"
      },
      {
        "path": "voices/am_liam.bin",
        "sizeBytes": 522240,
        "sha256": "52403be32fd047c6a44517cb0bcd6b134f2a18baa73e70ef41651e0eab921ade"
      },
      {
        "path": "voices/am_michael.bin",
        "sizeBytes": 522240,
        "sha256": "1d1f21dd8da39c30705cd4c75d039d265e9bc4a2a93ed09bc9e1b1225eb95ba1"
      },
      {
        "path": "voices/am_onyx.bin",
        "sizeBytes": 522240,
        "sha256": "da5d135b424164916d75a68ffb4c2abce3d7d5ccc82dd1ee6cf447ce286145e6"
      },
      {
        "path": "voices/am_puck.bin",
        "sizeBytes": 522240,
        "sha256": "fcf73c989033e9233e0b98713eca600c8c74dcc1614b37009d5450ff4a2274a0"
      },
      {
        "path": "voices/am_santa.bin",
        "sizeBytes": 522240,
        "sha256": "61150cf726ab6c5ed7a99f90a304f91f5a72c00c592e89ec94e5df11c319227a"
      },
      {
        "path": "voices/bf_alice.bin",
        "sizeBytes": 522240,
        "sha256": "08afa6ba24da61ea5e8efa139e5aadc938d83f0a6da5a900adaf763ac1da5573"
      },
      {
        "path": "voices/bf_emma.bin",
        "sizeBytes": 522240,
        "sha256": "669fe0647f9dd04fcab92f1439a40eeb4c8b4ab1f82e4996fe3d918ce4a63b73"
      },
      {
        "path": "voices/bf_isabella.bin",
        "sizeBytes": 522240,
        "sha256": "3754352c4aaa46d17f27654ab7518d65b62ad6163a0f55a5f4330c2da2c4e94f"
      },
      {
        "path": "voices/bf_lily.bin",
        "sizeBytes": 522240,
        "sha256": "5e0ee32ebe64a467124976b14e69590746f1c4ce41a12b587a50c862edfea335"
      },
      {
        "path": "voices/bm_daniel.bin",
        "sizeBytes": 522240,
        "sha256": "6b3194bbceffb746733cbc22c8f593dd44e401a71d53895a2dca891bc595a1e8"
      },
      {
        "path": "voices/bm_fable.bin",
        "sizeBytes": 522240,
        "sha256": "f889083196807b4adb15e9204252165f503b8d33d3982e681c52443c49d798f1"
      },
      {
        "path": "voices/bm_george.bin",
        "sizeBytes": 522240,
        "sha256": "c4b235a4c1f2cd3b939fed08b899ce9385638b763f7b73a59616c4fc9bd6c9bc"
      },
      {
        "path": "voices/bm_lewis.bin",
        "sizeBytes": 522240,
        "sha256": "b8f671cef828c30e66fdf0b0756a76bba58f6bb3398cbbf27058642acbcedb97"
      },
      {
        "path": "voices/ef_dora.bin",
        "sizeBytes": 522240,
        "sha256": "f66ec66bd295acb18372e37008533a9a3228483ccd294e7538d5d9294ac9a532"
      },
      {
        "path": "voices/em_alex.bin",
        "sizeBytes": 522240,
        "sha256": "27809e9eafdcbcfff90a3016c697568676531de2a2c39cee29c96c7bd6b83e95"
      },
      {
        "path": "voices/em_santa.bin",
        "sizeBytes": 522240,
        "sha256": "ad43b774e1ca24d05c6161297d8aeb770ac3d29bb95daf516727af5f7d543683"
      },
      {
        "path": "voices/ff_siwis.bin",
        "sizeBytes": 522240,
        "sha256": "a35f5675ad08948e326ae75fd0ea16ba5d0042e4f76b5f3d1df77d0a48c54861"
      },
      {
        "path": "voices/hf_alpha.bin",
        "sizeBytes": 522240,
        "sha256": "040be6a4425411cc01fda5fd06693c76bfa78572632852bc8cda9c99232ffb56"
      },
      {
        "path": "voices/hf_beta.bin",
        "sizeBytes": 522240,
        "sha256": "cd83ae0bb9b2e4e4fb92b4973bd8d1822ca0036d3c498bf4fc89aa8e33917cc7"
      },
      {
        "path": "voices/hm_omega.bin",
        "sizeBytes": 522240,
        "sha256": "b02d9222d9ed00ce26b302173a862c2c93f96cc40b5c422b8d14910b9ff34137"
      },
      {
        "path": "voices/hm_psi.bin",
        "sizeBytes": 522240,
        "sha256": "644daf88ba8aeb7bd08950bbdcd4453bb280864e49dc4df93fabc6be32e03f37"
      },
      {
        "path": "voices/if_sara.bin",
        "sizeBytes": 522240,
        "sha256": "409b69248798fcdc2542330c76953d230710f19b057e59cb82fdc3c4cf71265c"
      },
      {
        "path": "voices/im_nicola.bin",
        "sizeBytes": 522240,
        "sha256": "bc578e510d52a96d6940d46f12e96d7b3df00905dbea075113226d100e6e1ab0"
      },
      {
        "path": "voices/jf_alpha.bin",
        "sizeBytes": 522240,
        "sha256": "56b479360aad9f367aeb8cef908f9201cf48b4555e488c5f4590c9dfcd978bb6"
      },
      {
        "path": "voices/jf_gongitsune.bin",
        "sizeBytes": 522240,
        "sha256": "0f1181f3772d27b7c12aaf4bcd71e31b186c4146e330d074a3dc64ee392af396"
      },
      {
        "path": "voices/jf_nezumi.bin",
        "sizeBytes": 522240,
        "sha256": "13cb71eebb0b48739d444558322aa35a8c9a489b80e1e631f14d2e6aea93026b"
      },
      {
        "path": "voices/jf_tebukuro.bin",
        "sizeBytes": 522240,
        "sha256": "29c6c0561b4288d59639677bebe7533c919743d5ea68d0d2ae992644beea6696"
      },
      {
        "path": "voices/jm_kumo.bin",
        "sizeBytes": 522240,
        "sha256": "09e959d239724c734d65661f06f14cdabcddfd476bfaaad905a937099ae9e64f"
      },
      {
        "path": "voices/pf_dora.bin",
        "sizeBytes": 522240,
        "sha256": "3da7b5b2d91847ebf5646f57631af6ececae3c29a89cd300f06edf9aa6cfe9ee"
      },
      {
        "path": "voices/pm_alex.bin",
        "sizeBytes": 522240,
        "sha256": "0175c753f59c54e7fd5a995bedef0c5ff2fb67e0043dd3dcb2ae74ec2acbeb2a"
      },
      {
        "path": "voices/pm_santa.bin",
        "sizeBytes": 522240,
        "sha256": "8b012db3185778afe2e45a62cbad69db73021774fe68dda634bcc748a982eede"
      },
      {
        "path": "voices/zf_xiaobei.bin",
        "sizeBytes": 522240,
        "sha256": "5dde6e1c9c4f12c8b327bc29c0cee361a23b52b952c04636858ba637ec66e640"
      },
      {
        "path": "voices/zf_xiaoni.bin",
        "sizeBytes": 522240,
        "sha256": "08892b62a39af0a615cd0581238db7e19e44c578e8fa0bfd0e586e93327d9cba"
      },
      {
        "path": "voices/zf_xiaoxiao.bin",
        "sizeBytes": 522240,
        "sha256": "03adb5d5e3ddd88b047954e974e651cb0a4b524c985057e5d872e962c7be1169"
      },
      {
        "path": "voices/zf_xiaoyi.bin",
        "sizeBytes": 522240,
        "sha256": "bc1555c5c486099196ac254bae5e0bb543c121952a3092f50b7d8724f1bc36b3"
      },
      {
        "path": "voices/zm_yunjian.bin",
        "sizeBytes": 522240,
        "sha256": "de48a00bdbf3649f07162269a2b6e0513604389bfac8a2e6c75cb34b323ad6fa"
      },
      {
        "path": "voices/zm_yunxi.bin",
        "sizeBytes": 522240,
        "sha256": "7243892fb4e560d47014090ddf010f8b8b790f3c6b029ff82b2ac06aa4e27c8b"
      },
      {
        "path": "voices/zm_yunxia.bin",
        "sizeBytes": 522240,
        "sha256": "6b2b8fc15b3df19a368daebe5c581c7fabf433ee5b8a17ffd6b3d723cff8936d"
      },
      {
        "path": "voices/zm_yunyang.bin",
        "sizeBytes": 522240,
        "sha256": "261e2c89470534dbbcb8fd98b8fdc495ec94063d9bb6c8277f7be43cccba3f42"
      }
    ]
  }
};
