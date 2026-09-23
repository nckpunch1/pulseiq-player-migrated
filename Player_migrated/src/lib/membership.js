// A member row only assigns the player's team once it is accepted. Adopting the
// first row found regardless of status set users.teamId from a still-pending
// join request. Status-less rows are legacy accepted members, as Team.jsx renders them.
export const isAcceptedMemberRow = d => {
  const status = d.data().status
  return status === undefined || status === 'member'
}
