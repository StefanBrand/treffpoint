/*********************************************************************
hyphen is for id: e.g. #edit-div
underscore is for (d3) variable: e.g. edit_div
*********************************************************************/
(async () => {
  "use strict"

  //Modules
  const { app, dialog } = require('electron').remote
  const fs = require('fs')
  const path = require('path')
  window.$ = window.jQuery = require('jquery')
  const Sortable = require("sortablejs")
  const d3 = require('d3-selection')
  const db = require('electron-data') //db...database
  const db2 = require('electron-data')
  const PptxGenJs = require('pptxgenjs')

  // Constants
  const database_path = app.getPath('home') + '/.treffpoint'
  let is_first_start = false

  const darkgrey = 'a6a6a6'
  const event_name = 'TreffPUNKT - Du. Ich. Gott.'
  const titlePlaceholder = 'Z.B.: This I Believe'

  const textareaWithPlaceholder = '<textarea placeholder="(Max. 8 Zeilen...)"></textarea>'
  const edit_div = d3.select('body').append("div")
    .attr("id","edit-div")

  // Powerpoint
  const logo = { image: {
    x: 12, y: 0.2, h: 1.23, w: 1.15, rotate: 20,
    path: 'assets/img/logo-jugendkirchesued.png'
  }}
  const footer = { text: {
    text: event_name,
    options: {
      x: 0.2, y: 7, h: 0.37, w: 3.54,
      fontFace: 'Arial Black', fontSize: 16,
      color: darkgrey
    }
  }}

  /****** DATABASE ******/
  //Configure database
  db.config({
    filename: 'database',
    path: database_path,
    autosave: true,
    prettysave: true
  })

  async function fillDatabase(path_to_file) { //returns a Promise
    return db.setMany(JSON.parse(await fs.promises.readFile(path_to_file,'utf8')))
  }

  // Bind listeners to drop database file onto app window
  document.addEventListener('drop', function (e) {
    e.preventDefault();
    e.stopPropagation();

    for (let f of e.dataTransfer.files) {
      if(path.basename(f.path) === 'database.json') {
        fillDatabase(f.path).then(() => updateSonglist(), (e) => console.log(e))
      }
    }
  });
  document.addEventListener('dragover', function (e) {
    e.preventDefault();
    e.stopPropagation();
  });

  /****** FUNCTIONS ******/
  function showStartWizard () {
    dialog.showMessageBox({
      title: "Willkommen bei TreffPOINT!",
      message: "Diese App hilft uns, " +
        "die Liederfolien für den Lobpreis zu verwalten und " +
        "supereinfach PowerPoint-Präsentationen daraus zu erstellen.\n\n" +

        "Du kannst jetzt eine Lieddatenbank in die App laden " +
        "oder jederzeit später eine Lieddatenbank-Datei ins Appfenster ziehen. " +
        "Dadurch wird eine bestehende Lieddatenbank aktualisiert.",
      buttons: ['Lieddatenbank suchen', 'Überspringen']
    }, (response) => {
      if(response === 0) {
        fillDatabase(dialog.showOpenDialog({
          title: 'Lieddatenbank öffnen (database.json)',
          filters: [{ name: 'JSON-Datei', extensions: ['json'] }]
        })[0]).then(() => updateSonglist(), (e) => console.log(e))
      }
    })
  }

  function addTextareaIfCtrlEnter (e) {
    if (e.ctrlKey && e.key === "Enter") { //Strg + Enter
      $('#add-verse-button').click()
    }
  }

  function prepareEditDiv() {
    $('#wrapper').toggleClass('blurred')
    $('#overlay').toggle()
    $('#edit-div').slideToggle()
  }

  function cleanUpEditDiv () {
    $('#edit-div').toggle()
    $('#edit-div').contents().remove()
    $('#wrapper').toggleClass('blurred')
    $('#overlay').toggle()
    window.removeEventListener('keyup', addTextareaIfCtrlEnter)
  }

  async function createSongEditForm(old_songtitle) {
    prepareEditDiv()

    const edit_form = edit_div.append('form')
      .attr("id", "edit-form")
    edit_form.append('label')
      .attr('for','title-input')
      .text('Liedtitel:')

    // Populate with song details if available
    edit_form.append('input')
      .attr('type','text')
      .attr('id', 'title-input')
      .attr('placeholder', titlePlaceholder)
      .attr('required', 'true')
      .property('value', old_songtitle)

    edit_form.append('label')
      .text('Strophen/Refrain:')
    if(old_songtitle) {
      edit_form.selectAll('textarea')
        .data(await db.get(old_songtitle))
        .enter()
        .append('textarea')
          .text((verse) => verse)
    }
    if($('#edit-form > textarea').length === 0) {
      $('#edit-form').append(textareaWithPlaceholder)
    }

    // Create button to add a verse/chorus
    edit_form.append('button')
      .attr('id','add-verse-button')
      .attr('type','button')
      .html('Strophe/Refrain hinzufügen (<kbd>Strg</kbd>+<kbd>↵</kbd>) ➕')
    $('#add-verse-button').click(() => {
      $(textareaWithPlaceholder).insertBefore($('#add-verse-button'))
      $('#edit-form').children('textarea').last().focus()
    })
    // New textarea if you click Ctrl+Enter (handy for entering verses)
    window.addEventListener('keyup', addTextareaIfCtrlEnter, true)

    /****** Cancel, delete, save buttons ******/
    const edit_buttons = edit_form.append('div')
      .attr('id', 'edit-buttons')

    /* Cancel */
    edit_buttons.append('button')
      .attr('type','button')
      .attr('id', 'cancel-edit-button')
      .text('Abbrechen')
    $('#cancel-edit-button').click(() => {
      cleanUpEditDiv()
    })

    /* Delete */
    if(old_songtitle) {
      edit_buttons.append('button')
        .attr('type','button')
        .attr('id', 'delete-song-button')
        .text('LÖSCHEN')
      $('#delete-song-button').click(() => {
        db.unset(old_songtitle).then(() => updateSonglist())
        $('#servicelist').children().map((i,listitem) => {
          if(listitem.firstChild.textContent === old_songtitle) listitem.remove()
        })
        cleanUpEditDiv()
      })
    }

    /* Save */
    edit_buttons.append('button')
      .attr('type','submit')
      .attr('id', 'save-song-button')
      .text('Lied speichern')
    $('#edit-form').submit((e) => { //Only form can submit
      e.preventDefault(); //Prevent reloading of page (for whatever reason it even happens)

      const song = {
        title: $('#title-input')[0].value,
        lyrics: $('#edit-form').children('textarea')
          .map((i, textarea) => textarea.value.replace(/\n$/gm,'') )
          .toArray()
          .filter((verse) => verse.length > 0)
      }

      // Make a Promise to delete the database entry for the song if its title has changed
      let delete_old_song_promise = ''
      if(old_songtitle && (old_songtitle !== song.title)) delete_old_song_promise = db.unset(old_songtitle)

      //Wait for Promises to set the song and delete a now obsolete song entry
      Promise.all([
        db.set(song.title,song.lyrics),
        delete_old_song_promise
      ]).then((result) => {
        updateSonglist()
      })

      //Clean up
      cleanUpEditDiv()
    })
  }

  async function updateSonglist() {
    $('#songlist .icon').remove()
    //UPDATE - EXIT - ENTER
    let songlist_items = d3.select('#songlist')
      .selectAll('div')
      .data((await db.keys()).sort(Intl.Collator().compare)) //song titles

    songlist_items.exit().remove()
    songlist_items = songlist_items.enter().append('div')
      .merge(songlist_items)
        .text(d => d)
    songlist_items.append('span')
      .attr('class', 'icon edit-icon')
      .text('📝')
    songlist_items.append('span')
      .attr('class', 'icon remove-icon')
      .text('✖')
  }

  function retrieveServicesongs() { //Returns a promise or throws an error if list is empty
    let songtitles = []
    for( let listitem of $('#servicelist').children()) {
      songtitles.push(listitem.firstChild.textContent)
    }
    if(songtitles.length !== 0) {
      return db.getMany(songtitles) // Promise resolving to song titles + lyrics
    } else {
      throw new Error('Leider befinden sich keine Lieder in der rechten Box!')
    }
  }

  function createPowerpoint(servicesongs) {
    const pptx = new PptxGenJs()

    /****** MASTER SLIDES ******/
    pptx.setLayout('LAYOUT_WIDE')
    pptx.defineSlideMaster({ //Title Master
      title: 'TITLE_MASTER',
      bkgd: {path: 'assets/img/background-image.png'},
      objects: [
        logo
      ]
    })
    pptx.defineSlideMaster({ //Songtitle Master
      title: 'SONGTITLE_MASTER',
      bkgd: {path: 'assets/img/background-image.png'},
      objects: [
        logo, footer,
        { 'placeholder': {
          options: {
            name: 'songtitle', type: 'title',
            x: 1.05, y: 3.18, h: 1.64, w: 11.33,
            align: 'left',
            fontFace: 'Calibri', fontSize: 60,
            color: darkgrey
          },
          text: 'Liedtitel'
        }}
      ]
    })
    pptx.defineSlideMaster({ //Lyrics Master
      title: 'LYRICS_MASTER',
      bkgd: {path: 'assets/img/background-image.png'},
      objects: [
        logo, footer,
        { 'placeholder': {
          options: {
            name: 'songtitle', type: 'title',
            x:0.67, y:0.3, h: 1.25, w: 12,
            align: 'left',
            fontFace: 'Calibri', fontSize: 44, bold: true,
            color: darkgrey
          },
          text: 'Liedtitel'
        }},
        { 'placeholder': {
          options: {
            name: 'lyrics', type: 'body',
            x: 1.52, y: 1.95,
            h: 4.95, w: 11.28,
            valign: 'middle',
            fontFace: 'Calibri', fontSize: 33,
            color: 'f2f2f2'
          },
          text: 'Lyrics'
        }}
      ]
    })

    /****** ADD SLIDES ******/
    pptx.addNewSlide('TITLE_MASTER')
      .addText(event_name, {
        x: 1, y: 2.95, h: 1.61, w: 11.33,
        align: 'c',
        fontFace: 'Arial Black', fontSize: 44,
        color: darkgrey
      })
    //add slides for each song
    for (let song of Object.entries(servicesongs)) {
      song = {
        title: song[0],
        lyrics: song[1]
      }
      pptx.addNewSlide('SONGTITLE_MASTER')
        .addText(song.title, { placeholder: 'songtitle' })

      //add slides for each verse/chorus of song
      for(let verse of song.lyrics) {
        pptx.addNewSlide('LYRICS_MASTER')
          .addText(song.title, { placeholder: 'songtitle' })
          .addText(verse, { placeholder: 'lyrics' })
      }
    }
    pptx.save('TreffPOINT.pptx')
  }

  $(() => {
    //Make lists sortable
    Sortable.create(servicelist, {
      animation: 150,
      group: { name: 'servicelist', put: true },

      filter: '.remove-icon',
      onFilter: (e) => {
        e.item.parentNode.removeChild(e.item)
      }
    })
    Sortable.create(songlist, {
      group: { name: 'songlist', pull: 'clone' },
      sort: false,

      filter: '.edit-icon',
      onFilter: (e) => {
        const songtitle = e.target.previousSibling.textContent
        createSongEditForm(songtitle)
      }
    })

    //Fill database for first time and update songlist
    //If database doesn't exist it will be created at first save operation
    fillDatabase(database_path + '/database.json').then(() => updateSonglist(),
      (e) => {
        console.log(e, 'Noch keine Datenbankdatei am Standardspeicherort!')
        showStartWizard()
      })

    $('#save-button').on('click',async (e) => {
      try { createPowerpoint(await retrieveServicesongs()) }
      catch (e) { console.log(e) }
    })
    $('#new-song-button').click((e) => {
      createSongEditForm(undefined)
      $('#title-input').focus()
    })
  })
})()
