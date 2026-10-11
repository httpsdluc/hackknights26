/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/policy_vault.json`.
 */
export type PolicyVault = {
  "address": "HW56pPpGGjQxfp1UaGgJmDTSmMAHNcZnTo7qbEp3zYX1",
  "metadata": {
    "name": "policyVault",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Cosign policy vault: agent proposes, approvers approve, funds move only through execute"
  },
  "instructions": [
    {
      "name": "addPayee",
      "discriminator": [
        248,
        28,
        137,
        95,
        9,
        128,
        223,
        82
      ],
      "accounts": [
        {
          "name": "approver",
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.admin",
                "account": "vault"
              }
            ]
          }
        },
        {
          "name": "payeeTokenAccount"
        },
        {
          "name": "payee",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  121,
                  101,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "account",
                "path": "payeeTokenAccount"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "label",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "perTxLimit",
          "type": "u64"
        }
      ]
    },
    {
      "name": "approve",
      "discriminator": [
        69,
        74,
        217,
        36,
        115,
        117,
        97,
        76
      ],
      "accounts": [
        {
          "name": "approver",
          "signer": true
        },
        {
          "name": "vault",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.admin",
                "account": "vault"
              }
            ]
          },
          "relations": [
            "proposal"
          ]
        },
        {
          "name": "proposal",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "execute",
      "discriminator": [
        130,
        221,
        242,
        154,
        13,
        193,
        189,
        29
      ],
      "accounts": [
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.admin",
                "account": "vault"
              }
            ]
          },
          "relations": [
            "proposal",
            "payee"
          ]
        },
        {
          "name": "proposal",
          "writable": true
        },
        {
          "name": "payee",
          "relations": [
            "proposal"
          ]
        },
        {
          "name": "mint",
          "relations": [
            "vault"
          ]
        },
        {
          "name": "vaultTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "payeeTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "initializeVault",
      "discriminator": [
        48,
        191,
        163,
        44,
        71,
        129,
        63,
        164
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "admin"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "vaultTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "agent",
          "type": "pubkey"
        },
        {
          "name": "approvers",
          "type": {
            "vec": "pubkey"
          }
        },
        {
          "name": "largeAmount",
          "type": "u64"
        },
        {
          "name": "dailyCap",
          "type": "u64"
        },
        {
          "name": "payeeTimelockSecs",
          "type": "i64"
        }
      ]
    },
    {
      "name": "proposePayment",
      "discriminator": [
        102,
        219,
        97,
        51,
        201,
        219,
        247,
        27
      ],
      "accounts": [
        {
          "name": "agent",
          "writable": true,
          "signer": true,
          "relations": [
            "vault"
          ]
        },
        {
          "name": "vault",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.admin",
                "account": "vault"
              }
            ]
          }
        },
        {
          "name": "payee",
          "docs": [
            "fails with PayeeNotAllowed instead of AccountNotInitialized. Validated",
            "by hand in the handler (owner, discriminator, vault)."
          ]
        },
        {
          "name": "proposal",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  114,
                  111,
                  112,
                  111,
                  115,
                  97,
                  108
                ]
              },
              {
                "kind": "account",
                "path": "vault"
              },
              {
                "kind": "arg",
                "path": "nonce"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "kind",
          "type": "u8"
        },
        {
          "name": "evidenceHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "nonce",
          "type": "u64"
        }
      ]
    },
    {
      "name": "setAgentEnabled",
      "docs": [
        "Kill switch. Any approver can disable the agent; only the admin can re-enable it."
      ],
      "discriminator": [
        136,
        10,
        139,
        0,
        69,
        101,
        113,
        207
      ],
      "accounts": [
        {
          "name": "authority",
          "signer": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.admin",
                "account": "vault"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "enabled",
          "type": "bool"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "payee",
      "discriminator": [
        55,
        185,
        7,
        92,
        94,
        200,
        10,
        246
      ]
    },
    {
      "name": "proposal",
      "discriminator": [
        26,
        94,
        189,
        187,
        116,
        136,
        53,
        33
      ]
    },
    {
      "name": "vault",
      "discriminator": [
        211,
        8,
        232,
        43,
        2,
        152,
        117,
        119
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "agentCannotApprove",
      "msg": "The agent cannot be an approver"
    },
    {
      "code": 6001,
      "name": "unauthorized",
      "msg": "Signer is not allowed to do this"
    },
    {
      "code": 6002,
      "name": "agentDisabled",
      "msg": "The agent is disabled (kill switch)"
    },
    {
      "code": 6003,
      "name": "payeeNotAllowed",
      "msg": "Payee is not on the allowlist"
    },
    {
      "code": 6004,
      "name": "payeeTimelocked",
      "msg": "Payee is still under its timelock"
    },
    {
      "code": 6005,
      "name": "overPerTxLimit",
      "msg": "Amount is over the payee's per-transaction limit"
    },
    {
      "code": 6006,
      "name": "alreadyApproved",
      "msg": "This approver already approved"
    },
    {
      "code": 6007,
      "name": "notEnoughApprovals",
      "msg": "Not enough approvals"
    },
    {
      "code": 6008,
      "name": "dailyCapExceeded",
      "msg": "Daily cap exceeded"
    },
    {
      "code": 6009,
      "name": "alreadyExecuted",
      "msg": "Proposal already executed"
    }
  ],
  "types": [
    {
      "name": "payee",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "tokenAccount",
            "type": "pubkey"
          },
          {
            "name": "label",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "perTxLimit",
            "type": "u64"
          },
          {
            "name": "activeAfter",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "proposal",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "payee",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "kind",
            "type": "u8"
          },
          {
            "name": "evidenceHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "approvals",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "executed",
            "type": "bool"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "vault",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "agent",
            "type": "pubkey"
          },
          {
            "name": "agentEnabled",
            "type": "bool"
          },
          {
            "name": "approvers",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "largeAmount",
            "type": "u64"
          },
          {
            "name": "dailyCap",
            "type": "u64"
          },
          {
            "name": "spentToday",
            "type": "u64"
          },
          {
            "name": "dayIndex",
            "type": "i64"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "payeeTimelockSecs",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ]
};
